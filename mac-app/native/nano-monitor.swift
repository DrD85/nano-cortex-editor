// nano-monitor - play-through helper of the Nano Cortex Editor Mac app.
//
// Plays one channel pair of an audio input (the Nano's processed sound on USB channels 3/4) through another audio
// device (an audio interface, the Mac's speakers), like the audio settings of a standalone plugin. Input and output
// are two devices with two clocks: the sound goes through a small buffer, and a varispeed unit plays it a few
// millionths faster or slower so that the buffer stays at its level. Nothing is recorded.
//
//   nano-monitor --list                                        the audio outputs: [{"uid","name","channels","rate","default"}]
//   nano-monitor --in <uid> [--first 3] --out <uid> [--buffer 128] [--gain 1]
//                                                              play until stdin closes; "gain <0-4>" lines on stdin set the volume
//   nano-monitor --simulate <seconds> [--ppm 200] [--outrate 44100] [--inbuffer 64] [--buffer 512] [--jitter 0.3]
//                                                              the same engine on two made-up clocks, no device (a test)
//
// Lines while playing:
//   {"start":{"in":"Nano Cortex","out":"Scarlett 2i2","rate":48000,"outRate":44100,"first":3,"count":2,"buffer":128,"outBuffer":128}}
//   {"lat":8.4,"under":0,"skip":0,"ppm":-12.5,"fill":118,"p":[0.1,0.1]}     four times a second: the delay in ms, dropouts,
//                                                              buffer jumps, the speed correction, the buffer level, output peaks
//   {"error":"..."}                                            and the tool ends
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

func check(_ status: OSStatus, _ what: String) {
    if status != noErr { fail("The audio did not start (\(what): \(status)).") }
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

func channels(_ device: AudioDeviceID, _ scope: AudioObjectPropertyScope) -> Int {
    var where_ = address(kAudioDevicePropertyStreamConfiguration, scope)
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

func frames(_ device: AudioDeviceID, _ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope) -> Int {
    var where_ = address(selector, scope)
    var value: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    return AudioObjectGetPropertyData(device, &where_, 0, nil, &size, &value) == noErr ? Int(value) : 0
}

func defaultOutput() -> AudioDeviceID {
    var where_ = address(kAudioHardwarePropertyDefaultOutputDevice)
    var device = AudioDeviceID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    _ = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &where_, 0, nil, &size, &device)
    return device
}

// The frames a device hands over per round, as near to the wish as it allows (the setting is this program's own).
func setBuffer(_ device: AudioDeviceID, _ wanted: Int) -> Int {
    var range = AudioValueRange()
    var size = UInt32(MemoryLayout<AudioValueRange>.size)
    var where_ = address(kAudioDevicePropertyBufferFrameSizeRange)
    var value = UInt32(wanted)
    if AudioObjectGetPropertyData(device, &where_, 0, nil, &size, &range) == noErr {
        value = UInt32(min(max(Double(wanted), range.mMinimum), range.mMaximum))
    }
    where_ = address(kAudioDevicePropertyBufferFrameSize)
    _ = AudioObjectSetPropertyData(device, &where_, 0, nil, UInt32(MemoryLayout<UInt32>.size), &value)
    return frames(device, kAudioDevicePropertyBufferFrameSize, kAudioObjectPropertyScopeGlobal)
}

// What a device adds to the delay besides its buffer, in frames at its own rate.
func deviceDelay(_ device: AudioDeviceID, _ scope: AudioObjectPropertyScope) -> Int {
    frames(device, kAudioDevicePropertyLatency, scope) + frames(device, kAudioDevicePropertySafetyOffset, scope)
}

let selfTest = ProcessInfo.processInfo.environment["NANO_MONITOR_SELFTEST"] == "1"   // adds a test tone and an output that plays nothing
let selfTestInput = "selftest", selfTestOutput = "null"

func listOutputs() -> String {
    let standard = defaultOutput()
    var entries = allDevices().compactMap { device -> String? in
        let count = channels(device, kAudioDevicePropertyScopeOutput)
        guard count > 0 else { return nil }
        return "{\"uid\":" + jsonString(text(device, kAudioDevicePropertyDeviceUID)) + ",\"name\":" + jsonString(text(device, kAudioObjectPropertyName)) +
            ",\"channels\":\(count),\"rate\":" + number(sampleRate(device)) + ",\"default\":\(device == standard)}"
    }
    if selfTest { entries.append("{\"uid\":\"\(selfTestOutput)\",\"name\":\"No output (test)\",\"channels\":2,\"rate\":44100,\"default\":false}") }
    return "[" + entries.joined(separator: ",") + "]"
}

func stereoFormat(_ rate: Double, _ channelCount: Int = 2) -> AudioStreamBasicDescription {
    AudioStreamBasicDescription(mSampleRate: rate, mFormatID: kAudioFormatLinearPCM,
        mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved,
        mBytesPerPacket: 4, mFramesPerPacket: 1, mBytesPerFrame: 4, mChannelsPerFrame: UInt32(channelCount), mBitsPerChannel: 32, mReserved: 0)
}

// ---- the buffer between the two devices: one writer (input thread), one reader (output thread) ----
final class Ring {
    let capacity: Int   // frames, a power of two
    private let mask: Int
    private let data: UnsafeMutablePointer<Float32>   // left, right, left, right ...
    private var lock = os_unfair_lock()
    private var readIndex = 0
    private var count = 0

    init(capacity: Int) {
        self.capacity = capacity
        mask = capacity - 1
        data = UnsafeMutablePointer<Float32>.allocate(capacity: capacity * 2)
        data.initialize(repeating: 0, count: capacity * 2)
    }

    var available: Int {
        os_unfair_lock_lock(&lock)
        let n = count
        os_unfair_lock_unlock(&lock)
        return n
    }

    // The writer: false if there is no room (nobody reads) - the frames are left out.
    func write(_ left: UnsafePointer<Float32>, _ right: UnsafePointer<Float32>, _ n: Int) -> Bool {
        os_unfair_lock_lock(&lock)
        let start = (readIndex + count) & mask, free = capacity - count
        os_unfair_lock_unlock(&lock)
        guard n <= free else { return false }
        for i in 0..<n {
            let at = ((start + i) & mask) * 2
            data[at] = left[i]
            data[at + 1] = right[i]
        }
        os_unfair_lock_lock(&lock)
        count += n
        os_unfair_lock_unlock(&lock)
        return true
    }

    // The reader: as many frames as there are, n at most.
    func read(_ left: UnsafeMutablePointer<Float32>, _ right: UnsafeMutablePointer<Float32>, _ n: Int) -> Int {
        os_unfair_lock_lock(&lock)
        let start = readIndex, got = min(n, count)
        os_unfair_lock_unlock(&lock)
        for i in 0..<got {
            let at = ((start + i) & mask) * 2
            left[i] = data[at]
            right[i] = data[at + 1]
        }
        drop(got)
        return got
    }

    func drop(_ n: Int) {
        os_unfair_lock_lock(&lock)
        let gone = min(n, count)
        readIndex = (readIndex + gone) & mask
        count -= gone
        os_unfair_lock_unlock(&lock)
    }
}

// ---- the play-through: buffer -> varispeed (the output's rate, and the fine correction) -> volume ----
final class Engine {
    let ring = Ring(capacity: 1 << 16)
    let inRate: Double, outRate: Double
    let inBuffer: Int               // frames the input hands over per round
    private var varispeed: AudioUnit?
    private let scratch: UnsafeMutableAudioBufferListPointer
    private let scratchFrames = 8192
    // the reader's own (output thread)
    private var primed = false
    private var level: Double       // the buffer's level after a round, smoothed
    private var target: Double      // ... and where it should be
    private var speed = 1.0
    private var learned = 0.0       // the clock difference found so far (the slow part of the correction)
    private var sampleTime = 0.0
    private var gainNow: Float = 0
    // shared with the main thread
    private var lock = os_unfair_lock()
    private var gainWanted: Float
    private var underruns = 0, skips = 0
    private var peaks: [Float] = [0, 0]
    private var levelShown = 0.0, speedShown = 1.0

    // margin: what the buffer holds on top of half an input round, for rounds that come late (frames at the input's
    // rate; with large rounds at least half a round)
    init(inRate: Double, outRate: Double, inBuffer: Int, margin: Int, gain: Float) {
        self.inRate = inRate
        self.outRate = outRate
        self.inBuffer = inBuffer
        target = Double(inBuffer) / 2 + Double(max(margin, inBuffer / 2))
        level = target
        gainWanted = gain
        scratch = AudioBufferList.allocate(maximumBuffers: 2)
        for i in 0..<2 {
            let bytes = scratchFrames * MemoryLayout<Float32>.size
            scratch[i] = AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(bytes), mData: UnsafeMutableRawPointer.allocate(byteCount: bytes, alignment: 16))
        }

        var description = AudioComponentDescription(componentType: kAudioUnitType_FormatConverter, componentSubType: kAudioUnitSubType_Varispeed,
                                                    componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0)
        guard let component = AudioComponentFindNext(nil, &description) else { fail("No varispeed unit on this Mac.") }
        var created: AudioUnit?
        check(AudioComponentInstanceNew(component, &created), "varispeed")
        guard let unit = created else { fail("No varispeed unit on this Mac.") }
        let size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        var from = stereoFormat(inRate), to = stereoFormat(outRate)
        check(AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &from, size), "varispeed input format")
        check(AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &to, size), "varispeed output format")
        var most = UInt32(scratchFrames)
        check(AudioUnitSetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &most, UInt32(MemoryLayout<UInt32>.size)), "varispeed slice")
        var callback = AURenderCallbackStruct(inputProc: { refCon, _, _, _, frameCount, ioData in
            guard let ioData = ioData else { return noErr }
            Unmanaged<Engine>.fromOpaque(refCon).takeUnretainedValue().feed(UnsafeMutableAudioBufferListPointer(ioData), Int(frameCount))
            return noErr
        }, inputProcRefCon: Unmanaged.passUnretained(self).toOpaque())
        check(AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &callback,
                                   UInt32(MemoryLayout<AURenderCallbackStruct>.size)), "varispeed callback")
        check(AudioUnitInitialize(unit), "varispeed initialize")
        varispeed = unit
    }

    // The delay the varispeed unit itself adds, in seconds.
    var converterDelay: Double {
        guard let unit = varispeed else { return 0 }
        var seconds: Float64 = 0
        var size = UInt32(MemoryLayout<Float64>.size)
        return AudioUnitGetProperty(unit, kAudioUnitProperty_Latency, kAudioUnitScope_Global, 0, &seconds, &size) == noErr ? seconds : 0
    }

    func setGain(_ gain: Float) {
        os_unfair_lock_lock(&lock)
        gainWanted = max(0, min(4, gain))
        os_unfair_lock_unlock(&lock)
    }

    // The varispeed unit asks for input frames. Until the buffer has reached its level (at the start and after it
    // ran dry) it gets silence, so that the sound does not stutter along at the edge.
    private func feed(_ list: UnsafeMutableAudioBufferListPointer, _ n: Int) {
        guard list.count >= 2, let l = list[0].mData?.assumingMemoryBound(to: Float32.self),
              let r = list[1].mData?.assumingMemoryBound(to: Float32.self) else { return }
        if !primed {
            // It starts right after an input round came in - the level's highest point, half a round above its middle.
            let fill = ring.available, from = Int(target) + inBuffer / 2 + n
            if fill >= from {
                ring.drop(fill - from)   // (silence is playing: what came in on top is not missed)
                primed = true
                level = target
            }
        }
        var got = 0
        if primed {
            got = ring.read(l, r, n)
            if got < n {   // ran dry: a dropout. A little more in the buffer from now on.
                primed = false
                target = min(target + Double(max(24, inBuffer / 4)), Double(inBuffer) + inRate * 0.03)
                os_unfair_lock_lock(&lock)
                underruns += 1
                os_unfair_lock_unlock(&lock)
            }
        }
        for i in got..<n {
            l[i] = 0
            r[i] = 0
        }
    }

    // The output asks for n frames at its rate: one or two channels (more stay silent).
    func pull(_ out: UnsafeMutableAudioBufferListPointer, _ n: Int) {
        guard let unit = varispeed, n <= scratchFrames else {
            for buffer in out { if let data = buffer.mData { memset(data, 0, Int(buffer.mDataByteSize)) } }
            return
        }
        for i in 0..<2 { scratch[i].mDataByteSize = UInt32(n * MemoryLayout<Float32>.size) }
        var flags = AudioUnitRenderActionFlags()
        var time = AudioTimeStamp()
        time.mSampleTime = sampleTime
        time.mFlags = .sampleTimeValid
        sampleTime += Double(n)
        let status = AudioUnitRender(unit, &flags, &time, 0, UInt32(n), scratch.unsafeMutablePointer)
        let l = scratch[0].mData!.assumingMemoryBound(to: Float32.self), r = scratch[1].mData!.assumingMemoryBound(to: Float32.self)
        if status != noErr {
            for i in 0..<n {
                l[i] = 0
                r[i] = 0
            }
        }

        // Keep the buffer at its level: a little faster while it is fuller, a little slower while it is emptier
        // (0.00001 per frame, settling in a few seconds), and what stays off for longer is taken as the clocks'
        // difference and corrected for good, so the level comes back to where it should be.
        if primed {
            let fill = Double(ring.available), seconds = Double(n) / outRate
            level += min(1, seconds) * (fill - level)   // smoothed over a second
            if fill > target + Double(4 * inBuffer) + inRate * 0.05 {   // far too full (the output stood still): jump back
                ring.drop(Int(fill - target))
                level = target
                os_unfair_lock_lock(&lock)
                skips += 1
                os_unfair_lock_unlock(&lock)
            }
            learned = max(-0.0015, min(0.0015, learned + 0.000001 * (level - target) * seconds))
            speed = 1 + max(-0.002, min(0.002, 0.00001 * (level - target) + learned))
            AudioUnitSetParameter(unit, kVarispeedParam_PlaybackRate, kAudioUnitScope_Global, 0, AudioUnitParameterValue(speed), 0)
        }

        os_unfair_lock_lock(&lock)
        let wanted = gainWanted
        os_unfair_lock_unlock(&lock)
        let step = (wanted - gainNow) / Float(max(n, 1))   // no click when the volume moves
        var gain = gainNow, peakL: Float = 0, peakR: Float = 0
        let first = out.count > 0 ? out[0].mData?.assumingMemoryBound(to: Float32.self) : nil
        let second = out.count > 1 ? out[1].mData?.assumingMemoryBound(to: Float32.self) : nil
        for i in 0..<n {
            gain += step
            let a = l[i] * gain, b = r[i] * gain
            peakL = max(peakL, abs(a))
            peakR = max(peakR, abs(b))
            if let second = second {
                first?[i] = a
                second[i] = b
            } else {
                first?[i] = (a + b) / 2   // an output with one channel
            }
        }
        gainNow = wanted
        if out.count > 2 {
            for i in 2..<out.count { if let data = out[i].mData { memset(data, 0, Int(out[i].mDataByteSize)) } }
        }
        os_unfair_lock_lock(&lock)
        peaks[0] = max(peaks[0], peakL)
        peaks[1] = max(peaks[1], peakR)
        levelShown = level
        speedShown = speed
        os_unfair_lock_unlock(&lock)
    }

    struct Status { var underruns: Int, skips: Int, level: Double, speed: Double, peaks: [Float] }
    func take() -> Status {
        os_unfair_lock_lock(&lock)
        let status = Status(underruns: underruns, skips: skips, level: levelShown, speed: speedShown, peaks: peaks)
        peaks = [0, 0]
        os_unfair_lock_unlock(&lock)
        return status
    }
}

// ---- the audio input (HAL unit with the input side only), as in nano-meter ----
final class Capture {
    let engine: Engine
    let first: Int      // index of the first channel
    let count: Int
    var unit: AudioUnit?
    var buffers: UnsafeMutableAudioBufferListPointer
    let capacity = 16384   // frames per callback at most

    init(engine: Engine, channels: Int, first: Int, count: Int) {
        self.engine = engine
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
        let right = count > 1 ? buffers[first + 1].mData : left   // one channel: on both sides
        _ = engine.ring.write(UnsafePointer(left.assumingMemoryBound(to: Float32.self)), UnsafePointer(right!.assumingMemoryBound(to: Float32.self)), Int(frameCount))
        return noErr
    }
}

func halUnit() -> AudioUnit {
    var description = AudioComponentDescription(componentType: kAudioUnitType_Output, componentSubType: kAudioUnitSubType_HALOutput,
                                                componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0)
    guard let component = AudioComponentFindNext(nil, &description) else { fail("No audio unit on this Mac.") }
    var created: AudioUnit?
    check(AudioComponentInstanceNew(component, &created), "unit")
    guard let unit = created else { fail("No audio unit on this Mac.") }
    return unit
}

// The input's own format: (unit, rate, channels). The unit is not started yet.
func prepareInput(_ device: AudioDeviceID) -> (AudioUnit, Double, Int) {
    let unit = halUnit()
    var on: UInt32 = 1, off: UInt32 = 0
    let flag = UInt32(MemoryLayout<UInt32>.size)
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &on, flag), "input on")
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Output, 0, &off, flag), "output off")
    var id = device
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &id, UInt32(MemoryLayout<AudioDeviceID>.size)), "input device")
    var hardware = AudioStreamBasicDescription()
    var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    check(AudioUnitGetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 1, &hardware, &size), "input format")
    let count = Int(hardware.mChannelsPerFrame)
    guard count > 0, hardware.mSampleRate > 0 else { fail("This audio input has no channels.") }
    var wanted = stereoFormat(hardware.mSampleRate, count)   // all its channels at its sample rate
    check(AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 1, &wanted, size), "input channel format")
    return (unit, hardware.mSampleRate, count)
}

func startInput(_ unit: AudioUnit, _ capture: Capture) {
    capture.unit = unit
    var callback = AURenderCallbackStruct(inputProc: { refCon, flags, time, bus, frameCount, _ in
        Unmanaged<Capture>.fromOpaque(refCon).takeUnretainedValue().render(flags, time, bus, frameCount)
    }, inputProcRefCon: Unmanaged.passUnretained(capture).toOpaque())
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_SetInputCallback, kAudioUnitScope_Global, 0, &callback,
                               UInt32(MemoryLayout<AURenderCallbackStruct>.size)), "input callback")
    check(AudioUnitInitialize(unit), "input initialize")
    check(AudioOutputUnitStart(unit), "input start")
}

// The output's own format: (unit, rate, channels the program fills: 1 or 2). The unit is not started yet.
func prepareOutput(_ device: AudioDeviceID) -> (AudioUnit, Double, Int) {
    let unit = halUnit()
    var id = device   // (output is on and input off to begin with)
    check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &id, UInt32(MemoryLayout<AudioDeviceID>.size)), "output device")
    var hardware = AudioStreamBasicDescription()
    var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    check(AudioUnitGetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &hardware, &size), "output format")
    guard hardware.mChannelsPerFrame > 0, hardware.mSampleRate > 0 else { fail("This audio output has no channels.") }
    let count = min(2, Int(hardware.mChannelsPerFrame))
    var wanted = stereoFormat(hardware.mSampleRate, count)   // its own rate: the varispeed unit converts
    check(AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &wanted, size), "output channel format")
    return (unit, hardware.mSampleRate, count)
}

func startOutput(_ unit: AudioUnit, _ engine: Engine) {
    var callback = AURenderCallbackStruct(inputProc: { refCon, _, _, _, frameCount, ioData in
        guard let ioData = ioData else { return noErr }
        Unmanaged<Engine>.fromOpaque(refCon).takeUnretainedValue().pull(UnsafeMutableAudioBufferListPointer(ioData), Int(frameCount))
        return noErr
    }, inputProcRefCon: Unmanaged.passUnretained(engine).toOpaque())
    check(AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &callback,
                               UInt32(MemoryLayout<AURenderCallbackStruct>.size)), "output callback")
    check(AudioUnitInitialize(unit), "output initialize")
    check(AudioOutputUnitStart(unit), "output start")
}

// Ends the tool when a device goes away or changes its sample rate (the formats above are fixed).
func watch(_ device: AudioDeviceID, _ what: String) {
    for selector in [kAudioDevicePropertyDeviceIsAlive, kAudioDevicePropertyNominalSampleRate] {
        var where_ = address(selector)
        let rate = sampleRate(device)
        AudioObjectAddPropertyListenerBlock(device, &where_, DispatchQueue.main) { _, _ in
            var value: UInt32 = 1
            var size = UInt32(MemoryLayout<UInt32>.size)
            var alive = address(kAudioDevicePropertyDeviceIsAlive)
            if AudioObjectGetPropertyData(device, &alive, 0, nil, &size, &value) != noErr || value == 0 { fail("The audio \(what) is gone (cable?).") }
            if sampleRate(device) != rate { fail("The audio \(what) changed its sample rate - switch the monitor on again.") }
        }
    }
}

// A thread that calls work every "seconds" by the clock (no drift), until the tool ends.
func every(_ seconds: Double, _ work: @escaping () -> Void) {
    Thread.detachNewThread {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        let ticks = seconds * 1e9 * Double(info.denom) / Double(info.numer)
        // On time like an audio device's own thread (a usual thread comes milliseconds late now and then).
        var policy = thread_time_constraint_policy_data_t(period: UInt32(ticks), computation: UInt32(ticks / 10), constraint: UInt32(ticks / 2), preemptible: 1)
        let count = mach_msg_type_number_t(MemoryLayout<thread_time_constraint_policy_data_t>.size / MemoryLayout<integer_t>.size)
        _ = withUnsafeMutablePointer(to: &policy) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                thread_policy_set(pthread_mach_thread_np(pthread_self()), thread_policy_flavor_t(THREAD_TIME_CONSTRAINT_POLICY), $0, count)
            }
        }
        let start = Double(mach_absolute_time())
        var round = 0.0
        while true {
            work()
            round += 1
            mach_wait_until(UInt64(start + round * ticks))
        }
    }
}

// ---- a test without any device: two made-up clocks, a tone in, what comes out is checked ----
struct Lcg {   // the same "random" numbers every time
    var state: UInt64 = 0x2545F4914F6CDD1D
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double(state >> 11) / Double(1 << 53)
    }
}

func simulate(seconds: Double, ppm: Double, inRate: Double, outRate: Double, inBuffer: Int, outBuffer: Int, margin: Int, jitterMs: Double) {
    let engine = Engine(inRate: inRate, outRate: outRate, inBuffer: inBuffer, margin: margin, gain: 1)
    engine.setGain(1)
    let tone = 1000.0, amplitude = 0.1
    let inClock = inRate * (1 + ppm / 1e6)   // the input's clock runs this much fast
    var chunkL = [Float32](repeating: 0, count: inBuffer)
    var phase = 0.0
    var random = Lcg()
    let out = AudioBufferList.allocate(maximumBuffers: 2)
    for i in 0..<2 {
        let bytes = outBuffer * MemoryLayout<Float32>.size
        out[i] = AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(bytes), mData: UnsafeMutableRawPointer.allocate(byteCount: bytes, alignment: 16))
    }
    var pushes = 0.0, pulls = 0.0
    var nextPush = 0.0, nextPull = 0.004   // the output starts a moment later
    var written = 0, refused = 0
    let settle = min(8.0, seconds / 2)     // checked from here on
    var samples = [Float32]()
    samples.reserveCapacity(Int((seconds - settle) * outRate) + outBuffer)
    var speedSum = 0.0, speedCount = 0.0, levelSum = 0.0
    var before = engine.take()
    while min(nextPush, nextPull) < seconds {
        if nextPush <= nextPull {
            for i in 0..<inBuffer {
                chunkL[i] = Float32(amplitude * sin(phase))
                phase += 2 * Double.pi * tone / inRate
            }
            if phase > 1e6 { phase = phase.truncatingRemainder(dividingBy: 2 * Double.pi) }
            let ok = chunkL.withUnsafeBufferPointer { engine.ring.write($0.baseAddress!, $0.baseAddress!, inBuffer) }
            if ok { written += inBuffer } else { refused += 1 }
            pushes += 1
            nextPush = pushes * Double(inBuffer) / inClock + (random.next() - 0.5) * 2 * jitterMs / 1000   // rounds that come early or late
        } else {
            engine.pull(out, outBuffer)
            if nextPull >= settle {
                let l = out[0].mData!.assumingMemoryBound(to: Float32.self)
                samples.append(contentsOf: UnsafeBufferPointer(start: l, count: outBuffer))
                let status = engine.take()
                speedSum += status.speed
                levelSum += status.level
                speedCount += 1
            } else {
                before = engine.take()
            }
            pulls += 1
            nextPull = 0.004 + pulls * Double(outBuffer) / outRate
        }
    }
    let after = engine.take()
    // the tone that should come out: its frequency by the output's clock, its level, and no jumps in it
    var crossings = 0, firstCross = -1.0, lastCross = 0.0
    var sum = 0.0, jumps = 0, worst = 0.0
    let expected = tone * (1 + ppm / 1e6)
    let omega = 2 * Double.pi * expected / outRate
    let bend = amplitude * omega * omega   // the most a clean tone bends from one sample to the next
    for i in 0..<samples.count {
        let x = Double(samples[i])
        sum += x * x
        if i > 0, samples[i - 1] < 0, samples[i] >= 0 {
            let at = Double(i - 1) + Double(-samples[i - 1]) / Double(samples[i] - samples[i - 1])
            if firstCross < 0 { firstCross = at }
            lastCross = at
            crossings += 1
        }
        if i > 1 {
            let second = abs(x - 2 * Double(samples[i - 1]) + Double(samples[i - 2]))
            worst = max(worst, second / bend)
            if second > 1.5 * bend + 1e-5 { jumps += 1 }
        }
    }
    let frequency = crossings > 1 ? Double(crossings - 1) * outRate / (lastCross - firstCross) : 0
    let rms = samples.isEmpty ? 0 : (sum / Double(samples.count)).squareRoot()
    let meanLevel = speedCount > 0 ? levelSum / speedCount : 0
    emit("{\"simulated\":{\"seconds\":" + number(seconds) + ",\"ppm\":" + number(ppm) + ",\"inRate\":" + number(inRate) + ",\"outRate\":" + number(outRate) +
         ",\"inBuffer\":\(inBuffer),\"outBuffer\":\(outBuffer),\"jitterMs\":" + number(jitterMs) +
         ",\"frequency\":" + number(frequency) + ",\"expected\":" + number(expected) + ",\"dB\":" + number(20 * log10(max(rms * 2.0.squareRoot(), 1e-9))) +
         ",\"jumps\":\(jumps),\"worstBend\":" + number(worst) + ",\"underruns\":\(after.underruns - before.underruns),\"underrunsAtStart\":\(before.underruns)" +
         ",\"skips\":\(after.skips),\"refused\":\(refused),\"correctionPpm\":" + number(speedCount > 0 ? (speedSum / speedCount - 1) * 1e6 : 0) +
         ",\"level\":" + number(meanLevel) + ",\"bufferMs\":" + number((meanLevel + Double(outBuffer) * inRate / outRate / 2) / inRate * 1000) +
         ",\"converterMs\":" + number(engine.converterDelay * 1000) + "}}")
}

// ---- main ----
signal(SIGPIPE, SIG_IGN)
var arguments = Array(CommandLine.arguments.dropFirst())

if arguments.first == "--list" {
    emit(listOutputs())
    exit(0)
}

var inputUID = "", outputUID = ""
var firstChannel = 3
var buffer = 128, inBufferWish = 0
var gain: Float = 1
var simulated = 0.0, ppm = 200.0, outRateWish = 44100.0, jitter = 0.3
var marginMs = 1.5
while !arguments.isEmpty {
    let option = arguments.removeFirst()
    guard !arguments.isEmpty else { break }
    let value = arguments.removeFirst()
    switch option {
    case "--in": inputUID = value
    case "--out": outputUID = value
    case "--first": firstChannel = Int(value) ?? 3
    case "--buffer": buffer = max(16, min(4096, Int(value) ?? 128))
    case "--inbuffer": inBufferWish = max(16, min(4096, Int(value) ?? 0))
    case "--gain": gain = max(0, min(4, Float(value) ?? 1))
    case "--margin": marginMs = max(0.2, min(20, Double(value) ?? 1.5))
    case "--simulate": simulated = Double(value) ?? 0
    case "--ppm": ppm = Double(value) ?? 0
    case "--outrate": outRateWish = Double(value) ?? 44100
    case "--jitter": jitter = Double(value) ?? 0
    default: break
    }
}
if inBufferWish == 0 { inBufferWish = buffer }

if simulated > 0 {
    simulate(seconds: simulated, ppm: ppm, inRate: 48000, outRate: outRateWish, inBuffer: inBufferWish, outBuffer: buffer,
             margin: Int((marginMs * 48).rounded()), jitterMs: jitter)
    exit(0)
}
if inputUID.isEmpty || outputUID.isEmpty { fail("usage: nano-monitor --list | --in <uid> [--first <channel>] --out <uid> [--buffer <frames>] [--gain <0-4>]") }
if inputUID == outputUID { fail("Input and output are the same device - choose another output.") }

let testInput = selfTest && inputUID == selfTestInput, testOutput = selfTest && outputUID == selfTestOutput
var keep: [AnyObject] = []   // what must stay alive while the tool runs

// the two devices and their formats
var inRate = 48000.0, inChannels = 4, inBuffer = inBufferWish, inDelay = 0
var inName = "Test tone"
var inUnit: AudioUnit?
if !testInput {
    guard let device = allDevices().first(where: { text($0, kAudioDevicePropertyDeviceUID) == inputUID }) else { fail("This audio input is not there (any more).") }
    inBuffer = setBuffer(device, inBufferWish)
    let (unit, rate, count) = prepareInput(device)
    inUnit = unit
    inRate = rate
    inChannels = count
    inName = text(device, kAudioObjectPropertyName)
    inDelay = deviceDelay(device, kAudioDevicePropertyScopeInput)
    watch(device, "input")
}
guard firstChannel >= 1, firstChannel <= inChannels else { fail("This audio input has only \(inChannels) channel\(inChannels == 1 ? "" : "s").") }
let pairCount = firstChannel < inChannels ? 2 : 1

var outRate = 44100.0, outChannels = 2, outBuffer = buffer, outDelay = 0
var outName = "No output (test)"
var outUnit: AudioUnit?
if !testOutput {
    guard let device = allDevices().first(where: { text($0, kAudioDevicePropertyDeviceUID) == outputUID }) else { fail("This audio output is not there (any more).") }
    outBuffer = setBuffer(device, buffer)
    let (unit, rate, count) = prepareOutput(device)
    outUnit = unit
    outRate = rate
    outChannels = count
    outName = text(device, kAudioObjectPropertyName)
    outDelay = deviceDelay(device, kAudioDevicePropertyScopeOutput)
    watch(device, "output")
}

let engine = Engine(inRate: inRate, outRate: outRate, inBuffer: inBuffer, margin: Int((marginMs * inRate / 1000).rounded()), gain: gain)

// the output first (it plays silence until the buffer has its level), then the input
if let unit = outUnit {
    startOutput(unit, engine)
} else {
    let out = AudioBufferList.allocate(maximumBuffers: 2)
    for i in 0..<2 {
        let bytes = outBuffer * MemoryLayout<Float32>.size
        out[i] = AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(bytes), mData: UnsafeMutableRawPointer.allocate(byteCount: bytes, alignment: 16))
    }
    every(Double(outBuffer) / outRate) { engine.pull(out, outBuffer) }
}
if let unit = inUnit {
    let capture = Capture(engine: engine, channels: inChannels, first: firstChannel - 1, count: pairCount)
    startInput(unit, capture)
    keep.append(capture)
} else {
    // 1 kHz at -20 dBFS on channels 3/4 (half of that on 1/2), from a clock of its own
    let amplitude: Float = firstChannel >= 3 ? 0.1 : 0.05
    var block = [Float32](repeating: 0, count: inBuffer)
    var phase = 0.0
    every(Double(inBuffer) / inRate) {
        for i in 0..<block.count {
            block[i] = amplitude * Float(sin(phase))
            phase += 2 * Double.pi * 1000 / inRate
        }
        block.withUnsafeBufferPointer { _ = engine.ring.write($0.baseAddress!, $0.baseAddress!, block.count) }
    }
}

emit("{\"start\":{\"in\":" + jsonString(inName) + ",\"out\":" + jsonString(outName) + ",\"rate\":" + number(inRate) + ",\"outRate\":" + number(outRate) +
     ",\"first\":\(firstChannel),\"count\":\(pairCount),\"channels\":\(outChannels),\"buffer\":\(inBuffer),\"outBuffer\":\(outBuffer)}}")

// the app closes our stdin when it stops the monitor or quits; "gain <value>" lines set the volume
Thread.detachNewThread {
    while let line = readLine() {
        let words = line.split(separator: " ")
        if words.count == 2, words[0] == "gain", let value = Float(words[1]) { engine.setGain(value) }
    }
    exit(0)
}

// The delay from the Nano's USB output to the other device's output: both devices' own, both buffers, what waits
// between them and the converter.
let fixedMs = (Double(inDelay + inBuffer) / inRate + Double(outDelay + outBuffer) / outRate + engine.converterDelay) * 1000
let printer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "print"))
printer.schedule(deadline: .now() + .milliseconds(250), repeating: .milliseconds(250))
printer.setEventHandler {
    let status = engine.take()
    let waiting = (status.level + Double(outBuffer) * inRate / outRate / 2) / inRate * 1000
    emit("{\"lat\":" + String(format: "%.1f", fixedMs + waiting) + ",\"under\":\(status.underruns),\"skip\":\(status.skips),\"ppm\":" +
         String(format: "%.1f", (status.speed - 1) * 1e6) + ",\"fill\":" + String(format: "%.0f", status.level) +
         ",\"p\":[" + number(Double(status.peaks[0])) + "," + number(Double(status.peaks[1])) + "]}")
}
printer.resume()
dispatchMain()
