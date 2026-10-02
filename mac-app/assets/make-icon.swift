// Draws the app icon (1024x1024 PNG): dark rounded square with a knob in QC block colors.
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext

// Background squircle with subtle vertical gradient.
let inset: CGFloat = 100
let bgRect = NSRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset)
let bg = NSBezierPath(roundedRect: bgRect, xRadius: 185, yRadius: 185)
NSGraphicsContext.saveGraphicsState()
bg.addClip()
NSGradient(starting: NSColor(white: 0.17, alpha: 1), ending: NSColor(white: 0.03, alpha: 1))!.draw(in: bgRect, angle: -90)
NSGraphicsContext.restoreGraphicsState()
NSColor(white: 1, alpha: 0.08).setStroke()
bg.lineWidth = 4
bg.stroke()

let center = CGPoint(x: size / 2, y: size / 2 - 10)
let radius: CGFloat = 250
let start: CGFloat = 225, end: CGFloat = -45   // 270° sweep, like the editor knobs
let value: CGFloat = 0.72

func arc(from a: CGFloat, to b: CGFloat, color: NSColor, width: CGFloat) {
  let path = NSBezierPath()
  path.appendArc(withCenter: center, radius: radius, startAngle: a, endAngle: b, clockwise: true)
  path.lineWidth = width
  path.lineCapStyle = .round
  color.setStroke()
  path.stroke()
}

// Track, then the value arc as color segments (overdrive orange -> pitch yellow -> delay cyan).
arc(from: start, to: end, color: NSColor(white: 0.22, alpha: 1), width: 54)
let stops: [(CGFloat, NSColor)] = [
  (0.0, NSColor(red: 1.0, green: 0.44, blue: 0.0, alpha: 1)),
  (0.5, NSColor(red: 1.0, green: 0.82, blue: 0.21, alpha: 1)),
  (1.0, NSColor(red: 0.0, green: 1.0, blue: 0.87, alpha: 1))
]
let steps = 90
for i in 0..<steps {
  let t0 = CGFloat(i) / CGFloat(steps) * value, t1 = CGFloat(i + 1) / CGFloat(steps) * value
  let t = (t0 + t1) / 2 / value
  let (a, ca) = t < 0.5 ? stops[0] : stops[1]
  let (b, cb) = t < 0.5 ? stops[1] : stops[2]
  let color = ca.blended(withFraction: (t - a) / (b - a), of: cb)!
  arc(from: start - 270 * t0, to: start - 270 * t1 - (i < steps - 1 ? 0.6 : 0), color: color, width: 54)
}

// Knob body.
let knobRect = NSRect(x: center.x - 175, y: center.y - 175, width: 350, height: 350)
NSGradient(starting: NSColor(white: 0.24, alpha: 1), ending: NSColor(white: 0.08, alpha: 1))!
  .draw(in: NSBezierPath(ovalIn: knobRect), angle: -90)
NSColor(white: 0, alpha: 0.6).setStroke()
let rim = NSBezierPath(ovalIn: knobRect)
rim.lineWidth = 6
rim.stroke()

// Pointer.
let angle = (start - 270 * value) * .pi / 180
let pointer = NSBezierPath()
pointer.move(to: CGPoint(x: center.x + cos(angle) * 40, y: center.y + sin(angle) * 40))
pointer.line(to: CGPoint(x: center.x + cos(angle) * 150, y: center.y + sin(angle) * 150))
pointer.lineWidth = 30
pointer.lineCapStyle = .round
NSColor.white.setStroke()
pointer.stroke()

image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
