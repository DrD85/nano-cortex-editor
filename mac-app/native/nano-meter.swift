// nano-meter - level meter helper of the Nano Cortex Editor Mac app.
//
// The editor's page cannot read more than the first two channels of an audio input (Chromium opens every input
// with more than two channels as stereo), and the Nano sends its processed sound on USB channels 3/4. This tool
// opens the input with Core Audio, measures one channel pair and prints the result as JSON lines. Nothing is
// recorded: only peaks and the K-weighted energy (ITU-R BS.1770) leave the audio callback.
//
//   nano-meter --list                         all audio inputs: [{"uid","name","channels","rate","default"}]
//   nano-meter --device <uid> [--first 3]     measure channels first / first + 1 (1-based) until stdin closes
//
// Lines while measuring:
//   {"start":{"name":"Nano Cortex","channels":8,"rate":48000,"first":3,"count":2}}
//   {"p":[0.1,0.1],"e":0.0199,"n":1200}       every 25 ms: peaks, sum of the weighted squares of both channels, frames
//   {"error":"..."}                           and the tool ends
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

func number(_ value: Double) -> String {
    value.isFinite ? String(format: "%.7g", value) : "0"
}

func fail(_ message: String) -> Never {
    emit("{\"error\":" + jsonString(message) + "}")
    exit(2)
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

func inputChannels(_ device: AudioDeviceID) -> Int {
    var where_ = address(kAudioDevicePropertyStreamConfiguration, kAudioDevicePropertyScopeInput)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(device, &where_, 0, nil, &size) == noErr, size > 0 else { return 0 }
    let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(device, &where_, 0, nil, &size, raw) == noErr else { return 0 }
    let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
    return list.reduce(0) { $0 + Int($1.mNumberChannels) }
}

func sampleRate(_ device: AudioDeviceID) -> Double {
    var where_ = address(kAudioDevicePropertyNominalSampleRate)
    var rate: Float64 = 0
    var size = UInt32(MemoryLayout<Float64>.size)
    return AudioObjectGetPropertyData(device, &where_, 0, nil, &size, &rate) == noErr ? rate : 0
}

func defaultInput() -> AudioDeviceID {
    var where_ = address(kAudioHardwarePropertyDefaultInputDevice)
    var device = AudioDeviceID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    _ = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &where_, 0, nil, &size, &device)
    return device
}

let selfTest = ProcessInfo.processInfo.environment["NANO_METER_SELFTEST"] == "1"   // adds a test tone as an input
let selfTestUID = "selftest"

func listInputs() -> String {
    let standard = defaultInput()
    var entries = allDevices().compactMap { device -> String? in
        let channels = inputChannels(device)
        guard channels > 0 else { return nil }
        return "{\"uid\":" + jsonString(text(device, kAudioDevicePropertyDeviceUID)) + ",\"name\":" + jsonString(text(device, kAudioObjectPropertyName)) +
            ",\"channels\":\(channels),\"rate\":" + number(sampleRate(device)) + ",\"default\":\(device == standard)}"
    }
    if selfTest { entries.append("{\"uid\":\"\(selfTestUID)\",\"name\":\"Test tone\",\"channels\":4,\"rate\":48000,\"default\":false}") }
    return "[" + entries.joined(separator: ",") + "]"
}

// ---- K-weighting (ITU-R BS.1770): a high shelf and a high pass, coefficients for any sample rate ----
struct Biquad {
    var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    var z1 = 0.0, z2 = 0.0

    @inline(__always) mutating func process(_ x: Double) -> Double {
        let y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }

    static func shelf(_ rate: Double) -> Biquad {
        let k = tan(Double.pi * 1681.974450955533 / rate), q = 0.7071752369554196
        let vh = pow(10.0, 3.999843853973347 / 20), vb = pow(vh, 0.4996667741545416)
        let a0 = 1 + k / q + k * k
        return Biquad(b0: (vh + vb * k / q + k * k) / a0, b1: 2 * (k * k - vh) / a0, b2: (vh - vb * k / q + k * k) / a0,
                      a1: 2 * (k * k - 1) / a0, a2: (1 - k / q + k * k) / a0)
    }

    static func highPass(_ rate: Double) -> Biquad {
        let k = tan(Double.pi * 38.13547087602444 / rate), q = 0.5003270373238773
        let a0 = 1 + k / q + k * k
        return Biquad(b0: 1, b1: -2, b2: 1, a1: 2 * (k * k - 1) / a0, a2: (1 - k / q + k * k) / a0)
    }
}

// What the audio callback hands to the printing timer
final class Meter {
    private var lock = os_unfair_lock()
    private var shelf: [Biquad]
    private var high: [Biquad]
    private var peaks: [Float] = [0, 0]
    private var energy = 0.0
    private var frames = 0
    let count: Int

    init(rate: Double, count: Int) {
        self.count = count
        shelf = [Biquad.shelf(rate), Biquad.shelf(rate)]
        high = [Biquad.highPass(rate), Biquad.highPass(rate)]
    }

    // Called on the audio thread with one or two channels
    func consume(_ left: UnsafePointer<Float32>, _ right: UnsafePointer<Float32>?, _ n: Int) {
        var sum = 0.0
        var peakL: Float = 0, peakR: Float = 0
        for i in 0..<n {
            let x = left[i]
            peakL = max(peakL, abs(x))
            let y = high[0].process(shelf[0].process(Double(x)))
            sum += y * y
        }
        if let right = right {
            for i in 0..<n {
                let x = right[i]
                peakR = max(peakR, abs(x))
                let y = high[1].process(shelf[1].process(Double(x)))
                sum += y * y
            }
        }
        os_unfair_lock_lock(&lock)
        peaks[0] = max(peaks[0], peakL)
        peaks[1] = max(peaks[1], peakR)
        energy += sum
        frames += n
        os_unfair_lock_unlock(&lock)
    }

    func take() -> String? {
        os_unfair_lock_lock(&lock)
        let p = peaks, e = energy, n = frames
        peaks = [0, 0]
        energy = 0
        frames = 0
        os_unfair_lock_unlock(&lock)
        guard n > 0 else { return nil }
        let list = (0..<count).map { number(Double(p[$0])) }.joined(separator: ",")
        return "{\"p\":[" + list + "],\"e\":" + number(e) + ",\"n\":\(n)}"
    }
}

// ---- the audio input (HAL unit with the input side only) ----
final class Capture {
    let meter: Meter
    let first: Int      // index of the first channel
    let count: Int
    var unit: AudioUnit?
    var buffers: UnsafeMutableAudioBufferListPointer
    let capacity = 16384   // frames per callback at most

    init(meter: Meter, channels: Int, first: Int, count: Int) {
        self.meter = meter
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
        meter.consume(UnsafePointer(left.assumingMemoryBound(to: Float32.self)), right.map { UnsafePointer($0.assumingMemoryBound(to: Float32.self)) }, Int(frameCount))
        return noErr
    }
}

func check(_ status: OSStatus, _ what: String) {
    if status != noErr { fail("The audio input did not open (\(what): \(status)).") }
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

    // the device's own format: all its channels at its sample rate
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

    let capture = Capture(meter: Meter(rate: rate, count: count), channels: channels, first: first, count: count)
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

if arguments.first == "--list" {
    emit(listInputs())
    exit(0)
}

var uid = ""
var firstChannel = 1
while !arguments.isEmpty {
    let option = arguments.removeFirst()
    if option == "--device", !arguments.isEmpty { uid = arguments.removeFirst() }
    else if option == "--first", !arguments.isEmpty { firstChannel = Int(arguments.removeFirst()) ?? 1 }
}
if uid.isEmpty { fail("usage: nano-meter --list | --device <uid> [--first <channel>]") }

var meter: Meter
var keep: AnyObject?   // the capture stays alive while the tool runs

if selfTest && uid == selfTestUID {
    // 1 kHz at -20 dBFS on channels 3/4 (and half of that on 1/2), as an input with four channels
    let rate = 48000.0
    guard firstChannel >= 1, firstChannel <= 4 else { fail("This audio input has only 4 channels.") }
    let count = firstChannel < 4 ? 2 : 1
    meter = Meter(rate: rate, count: count)
    emit("{\"start\":{\"name\":\"Test tone\",\"channels\":4,\"rate\":48000,\"first\":\(firstChannel),\"count\":\(count)}}")
    let amplitude: Float = firstChannel >= 3 ? 0.1 : 0.05
    let source = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "tone"))
    var phase = 0.0
    var block = [Float32](repeating: 0, count: 480)
    let tone = meter
    source.schedule(deadline: .now(), repeating: .milliseconds(10))
    source.setEventHandler {
        for i in 0..<block.count {
            block[i] = amplitude * Float(sin(phase))
            phase += 2 * Double.pi * 1000 / rate
        }
        block.withUnsafeBufferPointer { tone.consume($0.baseAddress!, count > 1 ? $0.baseAddress! : nil, block.count) }
    }
    source.resume()
    keep = source as AnyObject
} else {
    guard let device = allDevices().first(where: { text($0, kAudioDevicePropertyDeviceUID) == uid }) else { fail("This audio input is not there (any more).") }
    let (capture, rate, channels, count) = openInput(device, first: firstChannel - 1)
    meter = capture.meter
    keep = capture
    emit("{\"start\":{\"name\":" + jsonString(text(device, kAudioObjectPropertyName)) + ",\"channels\":\(channels),\"rate\":" + number(rate) +
         ",\"first\":\(firstChannel),\"count\":\(count)}}")

    var alive = address(kAudioDevicePropertyDeviceIsAlive)
    AudioObjectAddPropertyListenerBlock(device, &alive, DispatchQueue.main) { _, _ in
        var value: UInt32 = 1
        var size = UInt32(MemoryLayout<UInt32>.size)
        var where_ = address(kAudioDevicePropertyDeviceIsAlive)
        let status = AudioObjectGetPropertyData(device, &where_, 0, nil, &size, &value)
        if status != noErr || value == 0 { fail("The audio input is gone (USB cable?).") }
    }
}

// the app closes our stdin when it stops the meter or quits
Thread.detachNewThread {
    while !FileHandle.standardInput.availableData.isEmpty {}
    exit(0)
}

let printer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "print"))
printer.schedule(deadline: .now() + .milliseconds(25), repeating: .milliseconds(25))
printer.setEventHandler { if let line = meter.take() { emit(line) } }
printer.resume()
dispatchMain()
