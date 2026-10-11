import AppKit

public final class MenuBuilder {
    public static func setupMenu(app: NSApplication, appDelegate: AppDelegate) {
        let mainMenu = NSMenu()

        // 1. App-Menü (HarnessCascade)
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu(title: "HarnessCascade")

        let aboutItem = NSMenuItem(title: "Über HarnessCascade", action: #selector(appDelegate.showAbout), keyEquivalent: "")
        aboutItem.target = appDelegate
        appMenu.addItem(aboutItem)

        appMenu.addItem(NSMenuItem.separator())

        let prefsItem = NSMenuItem(title: "Einstellungen…", action: #selector(appDelegate.openSettings), keyEquivalent: ",")
        prefsItem.target = appDelegate
        appMenu.addItem(prefsItem)

        appMenu.addItem(NSMenuItem.separator())

        let hideItem = NSMenuItem(title: "HarnessCascade ausblenden", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(hideItem)

        let hideOthersItem = NSMenuItem(title: "Andere ausblenden", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthersItem.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthersItem)

        let showAllItem = NSMenuItem(title: "Alle einblenden", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(showAllItem)

        appMenu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "HarnessCascade beenden", action: #selector(appDelegate.requestQuit), keyEquivalent: "q")
        quitItem.target = appDelegate
        appMenu.addItem(quitItem)

        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // 2. Bearbeiten (Edit) – essenziell für Copy/Paste/Undo in WKWebView Formularen
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Bearbeiten")

        editMenu.addItem(NSMenuItem(title: "Widerrufen", action: #selector(UndoManager.undo), keyEquivalent: "z"))
        let redoItem = NSMenuItem(title: "Wiederholen", action: #selector(UndoManager.redo), keyEquivalent: "Z")
        editMenu.addItem(redoItem)
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(NSMenuItem(title: "Ausschneiden", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Kopieren", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        let pasteItem = NSMenuItem(title: "Einsetzen", action: #selector(appDelegate.pasteClipboard), keyEquivalent: "v")
        pasteItem.target = appDelegate
        editMenu.addItem(pasteItem)
        editMenu.addItem(NSMenuItem(title: "Alles auswählen", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))

        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // 3. Darstellung (View)
        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "Darstellung")

        let reloadItem = NSMenuItem(title: "Neu laden", action: #selector(appDelegate.reloadPage), keyEquivalent: "r")
        reloadItem.target = appDelegate
        viewMenu.addItem(reloadItem)

        let hardReloadItem = NSMenuItem(title: "Ohne Cache neu laden", action: #selector(appDelegate.reloadPageWithoutCache), keyEquivalent: "R")
        hardReloadItem.target = appDelegate
        viewMenu.addItem(hardReloadItem)

        viewMenu.addItem(NSMenuItem.separator())

        let devToolsItem = NSMenuItem(title: "Entwickler-Werkzeuge", action: #selector(appDelegate.openDevTools), keyEquivalent: "i")
        devToolsItem.keyEquivalentModifierMask = [.command, .option]
        devToolsItem.target = appDelegate
        viewMenu.addItem(devToolsItem)

        viewMenu.addItem(NSMenuItem.separator())

        let fullscreenItem = NSMenuItem(title: "Vollbildmodus ein/aus", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullscreenItem.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(fullscreenItem)

        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        // 4. Server
        let serverMenuItem = NSMenuItem()
        let serverMenu = NSMenu(title: "Server")

        let openBrowserItem = NSMenuItem(title: "Im Standard-Browser öffnen", action: #selector(appDelegate.openInBrowser), keyEquivalent: "B")
        openBrowserItem.target = appDelegate
        serverMenu.addItem(openBrowserItem)

        let restartServerItem = NSMenuItem(title: "Server neu starten", action: #selector(appDelegate.restartServer), keyEquivalent: "")
        restartServerItem.target = appDelegate
        serverMenu.addItem(restartServerItem)

        let openLogItem = NSMenuItem(title: "Server-Log öffnen (/tmp/harness-router-studio.log)", action: #selector(appDelegate.openServerLog), keyEquivalent: "l")
        openLogItem.keyEquivalentModifierMask = [.command, .option]
        openLogItem.target = appDelegate
        serverMenu.addItem(openLogItem)

        serverMenuItem.submenu = serverMenu
        mainMenu.addItem(serverMenuItem)

        // 5. Fenster (Window)
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Fenster")

        windowMenu.addItem(NSMenuItem(title: "Minimieren", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "Zoomen", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        windowMenu.addItem(NSMenuItem.separator())

        let showWindowItem = NSMenuItem(title: "Hauptfenster anzeigen", action: #selector(appDelegate.showMainWindow), keyEquivalent: "1")
        showWindowItem.target = appDelegate
        windowMenu.addItem(showWindowItem)

        windowMenu.addItem(NSMenuItem(title: "Alle nach vorne bringen", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: ""))

        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        // 6. Hilfe (Help)
        let helpMenuItem = NSMenuItem()
        let helpMenu = NSMenu(title: "Hilfe")

        let docItem = NSMenuItem(title: "Dokumentation öffnen", action: #selector(appDelegate.openDocs), keyEquivalent: "")
        docItem.target = appDelegate
        helpMenu.addItem(docItem)

        helpMenuItem.submenu = helpMenu
        mainMenu.addItem(helpMenuItem)

        app.mainMenu = mainMenu
    }
}
