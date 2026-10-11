import AppKit
import WebKit
import UniformTypeIdentifiers

public final class MainWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate {
    public private(set) var webView: WKWebView!
    private var loadingView: NSView!
    private var spinner: NSProgressIndicator!
    private var statusLabel: NSTextField!
    private var retryButton: NSButton!

    public init() {
        let window = NSWindow(
            contentRect: NSRect(x: 100, y: 100, width: 1280, height: 840),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.minSize = NSSize(width: 800, height: 550)
        window.title = "CLIScade"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(calibratedRed: 0.043, green: 0.047, blue: 0.063, alpha: 1.0) // #0b0c10
        window.setFrameAutosaveName("CLIScadeMainWindow")
        window.center()

        super.init(window: window)
        window.delegate = self

        setupViews()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupViews() {
        guard let window = self.window else { return }
        let contentView = NSView(frame: window.contentView!.bounds)
        contentView.autoresizingMask = [.width, .height]
        window.contentView = contentView

        // 1. WKWebView Konfiguration
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.websiteDataStore = WKWebsiteDataStore.default()

        webView = WKWebView(frame: contentView.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground") // Transparent bis Seite geladen ist
        contentView.addSubview(webView)

        // 2. Elegante Ladeanzeige im Design der Web-App
        loadingView = NSView(frame: contentView.bounds)
        loadingView.autoresizingMask = [.width, .height]
        loadingView.wantsLayer = true
        loadingView.layer?.backgroundColor = NSColor(calibratedRed: 0.043, green: 0.047, blue: 0.063, alpha: 1.0).cgColor

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        loadingView.addSubview(stack)

        let titleLabel = NSTextField(labelWithString: "CLIScade")
        titleLabel.font = NSFont.systemFont(ofSize: 22, weight: .bold)
        titleLabel.textColor = NSColor(calibratedRed: 0.9, green: 0.92, blue: 0.95, alpha: 1.0)
        stack.addArrangedSubview(titleLabel)

        spinner = NSProgressIndicator()
        spinner.style = .spinning
        spinner.controlSize = .regular
        spinner.isDisplayedWhenStopped = false
        stack.addArrangedSubview(spinner)

        statusLabel = NSTextField(labelWithString: "Server startet…")
        statusLabel.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        statusLabel.textColor = NSColor(calibratedRed: 0.6, green: 0.65, blue: 0.75, alpha: 1.0)
        stack.addArrangedSubview(statusLabel)

        retryButton = NSButton(title: "Erneut versuchen", target: self, action: #selector(onRetryClicked))
        retryButton.bezelStyle = .rounded
        retryButton.isHidden = true
        stack.addArrangedSubview(retryButton)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: loadingView.centerYAnchor)
        ])

        contentView.addSubview(loadingView)
    }

    public func showLoading(status: String) {
        loadingView.isHidden = false
        spinner.startAnimation(nil)
        statusLabel.stringValue = status
        retryButton.isHidden = true
    }

    public func showError(message: String) {
        loadingView.isHidden = false
        spinner.stopAnimation(nil)
        statusLabel.stringValue = message
        retryButton.isHidden = false
    }

    public func hideLoading() {
        spinner.stopAnimation(nil)
        loadingView.isHidden = true
    }

    public func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]
        panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) }
    }

    public func pasteClipboard() {
        let fallback = { NSApp.sendAction(#selector(NSText.paste(_:)), to: nil, from: nil) }
        guard webView.url?.host == "127.0.0.1" || webView.url?.host == "localhost",
              let image = NSImage(pasteboard: .general),
              let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]) else {
            _ = fallback()
            return
        }
        let encoded = "data:image/png;base64," + png.base64EncodedString()
        webView.evaluateJavaScript("window.harnessPasteImage ? window.harnessPasteImage('\(encoded)') : false") { handled, error in
            if error != nil || (handled as? Bool) != true { _ = fallback() }
        }
    }

    public func loadServerURL() {
        showLoading(status: "Lade Oberfläche…")
        let url = ServerManager.shared.serverURL
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadRevalidatingCacheData
        webView.load(request)
    }

    @objc private func onRetryClicked() {
        showLoading(status: "Server startet…")
        ServerManager.shared.startServer { [weak self] success, errorMsg in
            guard let self = self else { return }
            if success {
                self.loadServerURL()
            } else {
                self.showError(message: errorMsg ?? "Verbindung fehlgeschlagen")
            }
        }
    }

    public func reload() {
        webView.reload()
    }

    public func reloadWithoutCache() {
        webView.reloadFromOrigin()
    }

    public func toggleDevTools() {
        // Öffnet den Web Inspector falls Entwickler-Werkzeuge aktiv sind
        webView.evaluateJavaScript("console.log('CLIScade DevTools getriggert');", completionHandler: nil)
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hideLoading()
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError(message: "Ladefehler: \(error.localizedDescription)")
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError(message: "Server nicht erreichbar: \(error.localizedDescription)")
    }

    // MARK: - NSWindowDelegate

    public func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Standard macOS: Fenster ausblenden statt Prozess beenden
        sender.orderOut(nil)
        return false
    }
}
