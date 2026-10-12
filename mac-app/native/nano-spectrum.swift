// nano-spectrum - spectrum helper of the Nano Cortex Editor Mac app.
//
// The EQ view shows the spectrum of the Nano's sound behind its curve. This tool opens an audio input with
// Core Audio (the Nano's processed sound is on USB channels 3/4, which the page cannot read), and prints the level
// of the sound in narrow bands as JSON lines, about twenty times a second. Nothing is recorded: only the band levels
// leave the tool.
//
//   nano-spectrum --device <uid> [--first 3]    channels first / first + 1 (1-based), mixed to one, until stdin closes
//
// Lines:
//   {"start":{"name":"Nano Cortex","rate":48000,"first":3,"count":2,"bands":120,"from":20,"perOctave":12}}
//   {"s":[-71.3,-68.0, ...]}                    dBFS of each band (a full-scale sine reads 0 in its band); band i is
//                                               centred on from * 2^(i / perOctave) Hz and a 1/perOctave octave wide
//   {"error":"..."}                             and the tool ends
import Accelerate
import AudioToolbox
import CoreAudio
import Foundation

// ---- output ----
func emit(_ line: String) {
    let bytes = Array((line + "\n").utf8)
    if write(STDOUT_FILENO, bytes, bytes.count) < 0 { exit(0) }   // the app is gone
}

func jsonString(_ text: String) -> String {
    let data = (try? JSONSerialization.data(withJSONObject: [text])) ?? Data("[\"\"]".utf8)
    return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
}

func fail(_ message: String) -> Never {
    emit("{\"error\":" + jsonString(message) + "}")
    exit(2)
}

func check(_ status: OSStatus, _ what: String) {
    if status != noErr { fail("The audio input did not open (\(what): \(status)).") }
}

// ---- Core Audio properties ----
func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func allDevices() -> [AudioDeviceID] {
    var where_ = address(kAudioHardwarePropertyDevices)
    var size: UInt32 = 0
    let system = AudioObjectID(kAudioObjectSystemObject)
    guard AudioObjectGetPropertyDataSize(system, &where_, 0, nil, &size) == noErr, size > 0 else { return [] }
    var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(system, &where_, 0, nil, &size, &ids) == noErr else { return [] }
    return ids
}

func text(_ device: AudioDeviceID, _ selector: AudioObjectPropertySelector) -> String {
    var where_ = address(selector)
    var value: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    let status = withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(device, &where_, 0, nil, &size, $0) }
    guard status == noErr, let string = value else { return "" }
    return string.takeRetainedValue() as String
}

// ---- the last stretch of sound, and its spectrum ----
let fftSize = 8192            // 170 ms at 48 kHz: bands down to 20 Hz get something to stand on
let bandsFrom = 20.0, bandsPerOctave = 12.0, bandCount = 120

final class Spectrum {
    let rate: Double
    private var lock = os_unfair_lock()
    private var recent = [Float](repeating: 0, count: fftSize)   // a ring: the newest sample is before "at"
    private var at = 0
    private var fresh = 0
    private let setup: FFTSetup
    private let log2n = vDSP_Length(13)
    private var window = [Float](repeating: 0, count: fftSize)
    private var frame = [Float](repeating: 0, count: fftSize)
    private var real = [Float](repeating: 0, count: fftSize / 2)
    private var imag = [Float](repeating: 0, count: fftSize / 2)
    private var power = [Float](repeating: 0, count: fftSize / 2)

    init(rate: Double) {
        self.rate = rate
        setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
        vDSP_hann_window(&window, vDSP_Length(fftSize), Int32(vDSP_HANN_DENORM))
    }

    // Called on the audio thread with one or two channels: they are mixed to one.
    func consume(_ left: UnsafePointer<Float32>, _ right: UnsafePointer<Float32>?, _ n: Int) {
        os_unfair_lock_lock(&lock)
        for i in 0..<n {
            recent[at] = right == nil ? left[i] : (left[i] + right![i]) / 2
            at = (at + 1) & (fftSize - 1)
        }
        fresh += n
        os_unfair_lock_unlock(&lock)
    }

    // The band levels of the last fftSize samples, nil while nothing new came in.
    func take() -> String? {
        os_unfair_lock_lock(&lock)
        let news = fresh
        fresh = 0
        let start = at
        if news > 0 {
            for i in 0..<fftSize { frame[i] = recent[(start + i) & (fftSize - 1)] }
        }
        os_unfair_lock_unlock(&lock)
        guard news > 0 else { return nil }

        vDSP_vmul(frame, 1, window, 1, &frame, 1, vDSP_Length(fftSize))
        real.withUnsafeMutableBufferPointer { realPointer in
            imag.withUnsafeMutableBufferPointer { imagPointer in
                var split = DSPSplitComplex(realp: realPointer.baseAddress!, imagp: imagPointer.baseAddress!)
                frame.withUnsafeBufferPointer { samples in
                    samples.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: fftSize / 2) {
                        vDSP_ctoz($0, 2, &split, 1, vDSP_Length(fftSize / 2))
                    }
                }
                vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                vDSP_zvmags(&split, 1, &power, 1, vDSP_Length(fftSize / 2))
            }
        }
        // vDSP's real transform is twice the textbook one: |X|^2 = power / 4. A full-scale sine under the Hann window
        // has (N^2 * 3 / 32) of it in its band, which is taken as 0 dB.
        let full = Double(fftSize) * Double(fftSize) * 3 / 32 * 4
        let binWidth = rate / Double(fftSize)
        var parts: [String] = []
        parts.reserveCapacity(bandCount)
        for band in 0..<bandCount {
            let centre = bandsFrom * pow(2, Double(band) / bandsPerOctave)
            let low = centre * pow(2, -0.5 / bandsPerOctave) / binWidth, high = centre * pow(2, 0.5 / bandsPerOctave) / binWidth   // in bins
            var sum = 0.0
            var bin = Int((low + 0.5).rounded(.down))   // the bin that low lies in
            while Double(bin) - 0.5 < high && bin < fftSize / 2 {
                // the part of this bin (from bin - 0.5 to bin + 0.5) that lies inside the band
                let share = min(high, Double(bin) + 0.5) - max(low, Double(bin) - 0.5)
                if share > 0 && bin > 0 { sum += Double(power[bin]) * share }
                bin += 1
            }
            // a band narrower than the window's own width (the lowest ones) cannot hold a whole sine: what it holds counts
            let db = sum > 0 ? 10 * log10(sum / full) : -140
            parts.append(String(format: "%.1f", max(-140, db)))
        }
        return "{\"s\":[" + parts.joined(separator: ",") + "]}"
    }
}

// ---- the audio input (HAL unit with the input side only), as in nano-meter ----
final class Capture {
    let spectrum: Spectrum
    let first: Int
    let count: Int
    var unit: AudioUnit?
    var buffers: UnsafeMutableAudioBufferListPointer
    let capacity = 16384

    init(spectrum: Spectrum, channels: Int, first: Int, count: Int) {
        self.spectrum = spectrum
        self.first = first
        self.count = count
        buffers = AudioBufferList.allocate(maximumBuffers: channels)
        for i in 0..<channels {
            let bytes = capacity * MemoryLayout<Float32>.size
            buffers[i] = AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(bytes), mData: UnsafeMutableRawPointer.allocate(byteCount: bytes, alignment: 16))
        }
    }

    func render(_ flags: UnsafeMutablePointer<AudioUnitRenderActionFlags>, _ time: UnsafePointer<AudioTimeStamp>, _ bus: UInt32, _ frameCount: UInt32) -> OSStatus {
        guard let unit = unit, Int(frameCount) <= capacity else { return noErr }
        for i in 0..<buffers.count { buffers[i].mDataByteSize = frameCount * UInt32(MemoryLayout<Float32>.size) }
        let status = AudioUnitRender(unit, flags, time, bus, frameCount, buffers.unsafeMutablePointer)
        guard status == noErr, let left = buffers[first].mData else { return status }
        let right = count > 1 ? buffers[first + 1].mData : nil
        spectrum.consume(UnsafePointer(left.assumingMemoryBound(to: Float32.self)), right.map { UnsafePointer($0.assumingMemoryBound(to: Float32.self)) }, Int(frameCount))
        return noErr
    }
}

func openInput(_ device: AudioDeviceID, first: Int) -> (Capture, Double, Int, Int) {
    var description = AudioComponentDescription(componentType: kAudioUnitType_Output, componentSubType: kAudioUnitSubType_HALOutput,
                                                componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0)
    guard let component = AudioComponentFindNext(nil, &description) else { fail("No audio input unit on this Mac.") }
    var created: AudioUnit?
    check(AudioComponentInstanceNew(component, &created), "unit")
    guard let unit = created else { fail("No audio input unit on this Mac.") }

    var on: UInt32 = 1, off: UInt32 = 0
    let flag = UInt32(MemoryLayout<UInt32>.size)
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &on, flag), "input on")
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Output, 0, &off, flag), "output off")
    var id = device
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &id, UInt32(MemoryLayout<AudioDeviceID>.size)), "device")

    var hardware = AudioStreamBasicDescription()
    var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    check(AudioUnitGetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 1, &hardware, &size), "format")
    let channels = Int(hardware.mChannelsPerFrame)
    let rate = hardware.mSampleRate
    guard channels > 0, rate > 0 else { fail("This audio input has no channels.") }
    guard first >= 0, first < channels else { fail("This audio input has only \(channels) channel\(channels == 1 ? "" : "s").") }
    let count = first + 1 < channels ? 2 : 1

    var wanted = AudioStreamBasicDescription(mSampleRate: rate, mFormatID: kAudioFormatLinearPCM,
        mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved,
        mBytesPerPacket: 4, mFramesPerPacket: 1, mBytesPerFrame: 4, mChannelsPerFrame: UInt32(channels), mBitsPerChannel: 32, mReserved: 0)
    check(AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 1, &wanted, size), "channel format")

    let capture = Capture(spectrum: Spectrum(rate: rate), channels: channels, first: first, count: count)
    capture.unit = unit
    var callback = AURenderCallbackStruct(inputProc: { refCon, flags, time, bus, frameCount, _ in
        Unmanaged<Capture>.fromOpaque(refCon).takeUnretainedValue().render(flags, time, bus, frameCount)
    }, inputProcRefCon: Unmanaged.passUnretained(capture).toOpaque())
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_SetInputCallback, kAudioUnitScope_Global, 0, &callback,
                               UInt32(MemoryLayout<AURenderCallbackStruct>.size)), "callback")
    check(AudioUnitInitialize(unit), "initialize")
    check(AudioOutputUnitStart(unit), "start")
    return (capture, rate, channels, count)
}

// ---- main ----
signal(SIGPIPE, SIG_IGN)
var arguments = Array(CommandLine.arguments.dropFirst())
var uid = ""
var firstChannel = 3
while !arguments.isEmpty {
    let option = arguments.removeFirst()
    if option == "--device", !arguments.isEmpty { uid = arguments.removeFirst() }
    else if option == "--first", !arguments.isEmpty { firstChannel = Int(arguments.removeFirst()) ?? 3 }
}
if uid.isEmpty { fail("usage: nano-spectrum --device <uid> [--first <channel>]") }

let selfTest = ProcessInfo.processInfo.environment["NANO_SPECTRUM_SELFTEST"] == "1"   // "selftest" is a made-up input
var spectrum: Spectrum
var keep: AnyObject?
let startTail = ",\"bands\":\(bandCount),\"from\":\(Int(bandsFrom)),\"perOctave\":\(Int(bandsPerOctave))}}"

if selfTest && uid == "selftest" {
    // 1 kHz at -20 dBFS, 220 Hz at -30 dBFS and a little noise, as an input with four channels
    let rate = 48000.0
    spectrum = Spectrum(rate: rate)
    emit("{\"start\":{\"name\":\"Test tone\",\"rate\":48000,\"first\":\(firstChannel),\"count\":2" + startTail)
    let source = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "tone"))
    var phaseA = 0.0, phaseB = 0.0
    var noise: UInt64 = 0x2545F4914F6CDD1D
    var block = [Float32](repeating: 0, count: 480)
    let target = spectrum
    source.schedule(deadline: .now(), repeating: .milliseconds(10))
    source.setEventHandler {
        for i in 0..<block.count {
            noise = noise &* 6364136223846793005 &+ 1442695040888963407
            let hiss = (Double(noise >> 11) / Double(1 << 53) - 0.5) * 0.002
            block[i] = Float(0.1 * sin(phaseA) + 0.0316 * sin(phaseB) + hiss)
            phaseA += 2 * Double.pi * 1000 / rate
            phaseB += 2 * Double.pi * 220 / rate
        }
        block.withUnsafeBufferPointer { target.consume($0.baseAddress!, nil, block.count) }
    }
    source.resume()
    keep = source as AnyObject
} else {
    guard let device = allDevices().first(where: { text($0, kAudioDevicePropertyDeviceUID) == uid }) else { fail("This audio input is not there (any more).") }
    let (capture, rate, _, count) = openInput(device, first: firstChannel - 1)
    spectrum = capture.spectrum
    keep = capture
    emit("{\"start\":{\"name\":" + jsonString(text(device, kAudioObjectPropertyName)) + ",\"rate\":\(Int(rate)),\"first\":\(firstChannel),\"count\":\(count)" + startTail)

    var alive = address(kAudioDevicePropertyDeviceIsAlive)
    AudioObjectAddPropertyListenerBlock(device, &alive, DispatchQueue.main) { _, _ in
        var value: UInt32 = 1
        var size = UInt32(MemoryLayout<UInt32>.size)
        var where_ = address(kAudioDevicePropertyDeviceIsAlive)
        let status = AudioObjectGetPropertyData(device, &where_, 0, nil, &size, &value)
        if status != noErr || value == 0 { fail("The audio input is gone (USB cable?).") }
    }
}

// the app closes our stdin when it stops the spectrum or quits
Thread.detachNewThread {
    while !FileHandle.standardInput.availableData.isEmpty {}
    exit(0)
}

let printer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "print"))
printer.schedule(deadline: .now() + .milliseconds(100), repeating: .milliseconds(45))
printer.setEventHandler { if let line = spectrum.take() { emit(line) } }
printer.resume()
dispatchMain()
