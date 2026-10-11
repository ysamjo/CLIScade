import AppKit

public final class AppDelegate: NSObject, NSApplicationDelegate {
    public private(set) var mainWindowController: MainWindowController!

    public func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.regular)

        MenuBuilder.setupMenu(app: NSApplication.shared, appDelegate: self)

        mainWindowController = MainWindowController()
        mainWindowController.showWindow(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)

        startServerAndLoadUI()
    }

    private func startServerAndLoadUI() {
        mainWindowController.showLoading(status: "Server wird geprüft / gestartet…")

        ServerManager.shared.startServer { [weak self] success, errorMsg in
            guard let self = self else { return }
            if success {
                self.mainWindowController.loadServerURL()
            } else {
                self.mainWindowController.showError(message: errorMsg ?? "Server konnte nicht gestartet werden.")
            }
        }
    }

    public func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            mainWindowController.window?.makeKeyAndOrderFront(nil)
        }
        return true
    }

    // MARK: - App-Beenden & Server-Lebenszyklus

    @objc public func requestQuit() {
        NSApplication.shared.terminate(nil)
    }

    public func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // Asynchron prüfen, ob aktive oder wartende Tasks laufen
        ServerManager.shared.fetchActiveTasksCount { running, queued in
            if running > 0 || queued > 0 {
                let alert = NSAlert()
                alert.messageText = "Laufende Aufgaben aktiv"
                var detail = "Es werden aktuell \(running) Aufgabe(n) ausgeführt"
                if queued > 0 {
                    detail += " und \(queued) weitere in der Warteschlange gehalten"
                }
                detail += ".\n\nWenn der Server beendet wird, werden laufende KI-Dispatches abgebrochen.\n\nWie möchtest du fortfahren?"
                alert.informativeText = detail
                alert.alertStyle = .warning

                alert.addButton(withTitle: "Abbrechen") // Return 1000
                alert.addButton(withTitle: "Trotzdem beenden") // Return 1001
                alert.addButton(withTitle: "Im Hintergrund weiterlaufen lassen") // Return 1002

                let response = alert.runModal()
                if response == .alertFirstButtonReturn {
                    // Abbrechen -> App bleibt offen
                    sender.reply(toApplicationShouldTerminate: false)
                    return
                } else if response == .alertSecondButtonReturn {
                    // Trotzdem beenden -> Server stoppen und beenden
                    ServerManager.shared.stopServer {
                        sender.reply(toApplicationShouldTerminate: true)
                    }
                    return
                } else {
                    // Im Hintergrund weiterlaufen lassen -> Server NICHT stoppen
                    sender.reply(toApplicationShouldTerminate: true)
                    return
                }
            }

            // Keine Tasks aktiv: Wenn der Server von der App gestartet wurde, stoppen
            if ServerManager.shared.startedByApp {
                ServerManager.shared.stopServer {
                    sender.reply(toApplicationShouldTerminate: true)
                }
            } else {
                sender.reply(toApplicationShouldTerminate: true)
            }
        }

        return .terminateLater
    }

    // MARK: - Menü-Aktionen

    @objc public func showAbout() {
        let alert = NSAlert()
        alert.messageText = "CLIscade"
        alert.informativeText = "Version 1.0.0\n\nLokale macOS-Steuerung für KI-Coding-Harnesses (Claude Code, Codex, Cline, OpenCode, Qoder, Antigravity, CodeBuddy, Cursor)."
        alert.alertStyle = .informational
        alert.runModal()
    }

    @objc public func openSettings() {
        showMainWindow()
        mainWindowController.webView.evaluateJavaScript("if (window.openConfigModal) { window.openConfigModal(); } else { const btn = document.getElementById('config-btn'); if (btn) btn.click(); }", completionHandler: nil)
    }

    @objc public func pasteClipboard() {
        mainWindowController.pasteClipboard()
    }

    @objc public func reloadPage() {
        mainWindowController.reload()
    }

    @objc public func reloadPageWithoutCache() {
        mainWindowController.reloadWithoutCache()
    }

    @objc public func openDevTools() {
        mainWindowController.toggleDevTools()
    }

    @objc public func openInBrowser() {
        NSWorkspace.shared.open(ServerManager.shared.serverURL)
    }

    @objc public func restartServer() {
        mainWindowController.showLoading(status: "Server wird neu gestartet…")
        ServerManager.shared.stopServer { [weak self] in
            guard let self = self else { return }
            self.startServerAndLoadUI()
        }
    }

    @objc public func openServerLog() {
        let logUrl = URL(fileURLWithPath: "/tmp/cliscade.log")
        if FileManager.default.fileExists(atPath: logUrl.path) {
            NSWorkspace.shared.open(logUrl)
        } else {
            let alert = NSAlert()
            alert.messageText = "Log-Datei nicht gefunden"
            alert.informativeText = "Unter \(logUrl.path) liegt aktuell noch kein Log."
            alert.alertStyle = .informational
            alert.runModal()
        }
    }

    @objc public func showMainWindow() {
        mainWindowController.window?.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    @objc public func openDocs() {
        let repoRoot = ServerManager.shared.findProjectRoot()
        let readmeURL = URL(fileURLWithPath: "\(repoRoot)/README.md")
        if FileManager.default.fileExists(atPath: readmeURL.path) {
            NSWorkspace.shared.open(readmeURL)
        } else if let github = URL(string: "https://github.com/ysamjo/CLIScade") {
            NSWorkspace.shared.open(github)
        }
    }
}
