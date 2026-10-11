import Foundation

public final class ServerManager {
    public static let shared = ServerManager()

    public let port: Int
    public let host: String
    public let serverURL: URL

    public private(set) var startedByApp: Bool = false
    public private(set) var serverPid: pid_t? = nil

    private init() {
        let envPort = ProcessInfo.processInfo.environment["PORT"].flatMap { Int($0) } ?? 3000
        self.port = envPort
        self.host = "127.0.0.1"
        self.serverURL = URL(string: "http://127.0.0.1:\(envPort)")!
    }

    public func findProjectRoot() -> String {
        // 1. Aus der Umgebung
        if let envDir = ProcessInfo.processInfo.environment["HARNESS_ROUTER_DIR"],
           FileManager.default.fileExists(atPath: "\(envDir)/server.js") {
            return envDir
        }

        // 2. Aus dem App-Bundle (wenn als eigenständiges Paket gebündelt)
        if let bundleAppPath = Bundle.main.resourceURL?.appendingPathComponent("app").path,
           FileManager.default.fileExists(atPath: "\(bundleAppPath)/server.js") {
            return bundleAppPath
        }

        // 3. Relativ zum App-Bundle oder Entwicklungsordner
        let bundlePath = Bundle.main.bundlePath
        let possibleParent = URL(fileURLWithPath: bundlePath).deletingLastPathComponent().deletingLastPathComponent().path
        if FileManager.default.fileExists(atPath: "\(possibleParent)/server.js") {
            return possibleParent
        }

        // 4. Standard-Entwicklungsverzeichnis
        let defaultDevDir = "/Users/family/Developer/HarnessCascade"
        if FileManager.default.fileExists(atPath: "\(defaultDevDir)/server.js") {
            return defaultDevDir
        }

        return FileManager.default.currentDirectoryPath
    }

    public func findPythonExecutable() -> String {
        for candidate in ["/opt/homebrew/bin/python3", "/usr/bin/python3", "/usr/local/bin/python3"] {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }
        return "/usr/bin/python3"
    }

    public func checkServerRunning(completion: @escaping (Bool) -> Void) {
        let statusURL = serverURL.appendingPathComponent("api/status")
        var request = URLRequest(url: statusURL)
        request.httpMethod = "GET"
        request.timeoutInterval = 1.0

        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            if let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                DispatchQueue.main.async { completion(true) }
            } else {
                DispatchQueue.main.async { completion(false) }
            }
        }
        task.resume()
    }

    public func startServer(completion: @escaping (Bool, String?) -> Void) {
        checkServerRunning { [weak self] isRunning in
            guard let self = self else { return }
            if isRunning {
                self.startedByApp = false
                completion(true, nil)
                return
            }

            let projectRoot = self.findProjectRoot()
            let detachedScript = "\(projectRoot)/tools/start-detached.py"

            guard FileManager.default.fileExists(atPath: detachedScript) else {
                completion(false, "Launcher-Skript nicht gefunden: \(detachedScript)")
                return
            }

            let pythonBin = self.findPythonExecutable()
            let process = Process()
            process.executableURL = URL(fileURLWithPath: pythonBin)
            process.arguments = [detachedScript]
            process.currentDirectoryURL = URL(fileURLWithPath: projectRoot)

            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe

            do {
                try process.run()
                process.waitUntilExit()

                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""

                // Ausgabe parsen: "pid 12345"
                if let pidLine = output.components(separatedBy: .newlines).first(where: { $0.hasPrefix("pid ") }) {
                    let pidStr = pidLine.replacingOccurrences(of: "pid ", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                    if let pidNum = Int32(pidStr) {
                        self.serverPid = pidNum
                        self.startedByApp = true
                    }
                }

                // Warten bis der Server auf Port antwortet (bis zu 10 Sekunden)
                self.pollUntilServerReady(timeout: 10.0, completion: completion)
            } catch {
                completion(false, "Konnte Server-Prozess nicht starten: \(error.localizedDescription)")
            }
        }
    }

    private func pollUntilServerReady(timeout: TimeInterval, completion: @escaping (Bool, String?) -> Void) {
        let startTime = Date()
        let interval: TimeInterval = 0.3

        func tryConnect() {
            self.checkServerRunning { [weak self] ready in
                guard self != nil else { return }
                if ready {
                    completion(true, nil)
                    return
                }

                if Date().timeIntervalSince(startTime) >= timeout {
                    completion(false, "Server reagiert nach \(Int(timeout))s nicht. Bitte Log prüfen: /tmp/harness-router-studio.log")
                    return
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + interval) {
                    tryConnect()
                }
            }
        }

        tryConnect()
    }

    public struct ActiveRunsResponse: Decodable {
        public let running: [RunItem]
        public let queued: [RunItem]

        public struct RunItem: Decodable {
            public let taskId: String?
            public let projectName: String?
        }
    }

    public func fetchActiveTasksCount(completion: @escaping (_ running: Int, _ queued: Int) -> Void) {
        let runsURL = serverURL.appendingPathComponent("api/runs")
        var request = URLRequest(url: runsURL)
        request.httpMethod = "GET"
        request.timeoutInterval = 2.0

        let task = URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let decoded = try? JSONDecoder().decode(ActiveRunsResponse.self, from: data) else {
                DispatchQueue.main.async { completion(0, 0) }
                return
            }
            DispatchQueue.main.async {
                completion(decoded.running.count, decoded.queued.count)
            }
        }
        task.resume()
    }

    public func stopServer(completion: @escaping () -> Void) {
        guard startedByApp else {
            // Wenn der Server schon vor dem App-Start lief, fassen wir ihn nicht ungefragt an.
            completion()
            return
        }

        if let pid = self.serverPid {
            // SIGTERM an Prozessgruppe senden
            kill(-pid, SIGTERM)
            kill(pid, SIGTERM)
        } else {
            // Fallback: Port-Lookup
            let port = self.port
            let lsof = Process()
            lsof.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
            lsof.arguments = ["-nP", "-iTCP:\(port)", "-sTCP:LISTEN", "-t"]
            let pipe = Pipe()
            lsof.standardOutput = pipe
            try? lsof.run()
            lsof.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let outStr = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               let numPid = Int32(outStr) {
                kill(-numPid, SIGTERM)
                kill(numPid, SIGTERM)
            }
        }

        self.serverPid = nil
        self.startedByApp = false

        // Kurze Pause zum Entbinden des Ports
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            completion()
        }
    }
}
