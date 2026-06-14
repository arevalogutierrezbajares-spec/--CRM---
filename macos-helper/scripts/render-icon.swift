import AppKit

let S: CGFloat = 1024
let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(S), pixelsHigh: Int(S),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

// Brand rounded-rect background (squircle-ish), near-black like the logo stroke.
let inset = S * 0.06
let rrect = NSRect(x: inset, y: inset, width: S - 2*inset, height: S - 2*inset)
let bg = NSBezierPath(roundedRect: rrect, xRadius: S*0.2, yRadius: S*0.2)
NSColor(red: 0x16/255.0, green: 0x15/255.0, blue: 0x13/255.0, alpha: 1).setFill()
bg.fill()

// AGB monogram (crm.svg). Content bbox in the 200x200 viewBox: x 8..192, y 44..166.
let bx: CGFloat = 8, by: CGFloat = 44, bw: CGFloat = 184, bh: CGFloat = 122
let target = S * 0.60
let scale = target / bw
let totalW = bw * scale, totalH = bh * scale
let originX = (S - totalW) / 2, originY = (S - totalH) / 2
func p(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
    NSPoint(x: originX + (x - bx) * scale, y: S - (originY + (y - by) * scale))
}
let path = NSBezierPath()
path.move(to: p(62, 44));  path.line(to: p(84, 44));  path.line(to: p(44, 166)); path.line(to: p(8, 166));  path.close()
path.move(to: p(89, 44));  path.line(to: p(111, 44)); path.line(to: p(111, 166)); path.line(to: p(89, 166)); path.close()
path.move(to: p(116, 44)); path.line(to: p(138, 44)); path.line(to: p(192, 166)); path.line(to: p(156, 166)); path.close()
NSColor(red: 0xF0/255.0, green: 0xEE/255.0, blue: 0xE8/255.0, alpha: 1).setFill()
path.fill()

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "/tmp/agb-icon-1024.png"))
print("wrote /tmp/agb-icon-1024.png")
