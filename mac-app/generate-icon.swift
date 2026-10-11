import AppKit
import Foundation

guard CommandLine.arguments.count >= 3 else {
    print("Verwendung: generate-icon <input.svg> <output.icns>")
    exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

let svgUrl = URL(fileURLWithPath: inputPath)
guard let image = NSImage(contentsOf: svgUrl) else {
    print("Fehler: SVG konnte nicht geladen werden von \(inputPath)")
    exit(1)
}

let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("harness-iconset-\(UUID().uuidString)")
let iconsetDir = tempDir.appendingPathComponent("AppIcon.iconset")

do {
    try FileManager.default.createDirectory(at: iconsetDir, withIntermediateDirectories: true)
} catch {
    print("Fehler beim Erstellen des temporären Ordners: \(error)")
    exit(1)
}

defer {
    try? FileManager.default.removeItem(at: tempDir)
}

func renderPNG(size: Int, filename: String) -> Bool {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )
    guard let bitmapRep = rep else { return false }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmapRep)
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmapRep.representation(using: .png, properties: [:]) else { return false }
    let destUrl = iconsetDir.appendingPathComponent(filename)
    do {
        try data.write(to: destUrl)
        return true
    } catch {
        print("Fehler beim Schreiben von \(filename): \(error)")
        return false
    }
}

let sizes: [(Int, String)] = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png")
]

for (sz, fname) in sizes {
    if !renderPNG(size: sz, filename: fname) {
        print("Fehler beim Rendern von \(fname)")
        exit(1)
    }
}

let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconsetDir.path, "-o", outputPath]

do {
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        print("iconutil fehlgeschlagen mit Status \(process.terminationStatus)")
        exit(1)
    }
    print("AppIcon.icns erfolgreich erstellt: \(outputPath)")
} catch {
    print("Fehler beim Ausführen von iconutil: \(error)")
    exit(1)
}
