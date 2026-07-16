import AppKit
import AVFoundation
import QuartzCore

/// Full-bleed cinematic idle surface: looping Venezuela landscapes + rotating
/// Simón Bolívar quotes. Shown only when not recording so the panel is more
/// than a bare Start button.
final class IdleCinemaView: NSView {

    struct Quote: Equatable {
        let text: String
        let attribution: String
    }

    /// Curated Bolívar lines (Spanish primary, commonly attributed).
    static let bolivarQuotes: [Quote] = [
        Quote(
            text: "Un pueblo ignorante es instrumento ciego de su propia destrucción.",
            attribution: "Simón Bolívar"
        ),
        Quote(
            text: "El arte de vencer se aprende en las derrotas.",
            attribution: "Simón Bolívar"
        ),
        Quote(
            text: "La gloria está en ser grande y en ser útil.",
            attribution: "Simón Bolívar"
        ),
        Quote(
            text: "Si la naturaleza se opone, lucharemos contra ella y haremos que nos obedezca.",
            attribution: "Simón Bolívar"
        ),
        Quote(
            text: "La libertad es un alimento suculento, pero de difícil digestión.",
            attribution: "Simón Bolívar"
        ),
        Quote(
            text: "Morir es nada cuando por la patria se muere.",
            attribution: "Simón Bolívar"
        ),
        Quote(
            text: "La justicia es la reina de las virtudes republicanas.",
            attribution: "Simón Bolívar"
        ),
        Quote(
            text: "El sistema de gobierno más perfecto es aquel que produce mayor suma de felicidad posible.",
            attribution: "Simón Bolívar"
        ),
    ]

    private let playerLayer = AVPlayerLayer()
    private var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var playlist: [URL] = []
    private var clipIndex = 0
    private var endObserver: NSObjectProtocol?

    private let dimLayer = CAGradientLayer()
    private let vignetteLayer = CAGradientLayer()
    private let grainLayer = CALayer()

    private let quoteLabel = NSTextField(wrappingLabelWithString: "")
    private let attrLabel = NSTextField(labelWithString: "")
    private let statusLabel = NSTextField(labelWithString: "Listo · watching for calls")

    private var quoteIndex = 0
    private var quoteTimer: Timer?
    private var clipTimer: Timer?
    private var isPlaying = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.masksToBounds = true
        layer?.cornerRadius = 12
        layer?.backgroundColor = NSColor(calibratedRed: 0.06, green: 0.08, blue: 0.12, alpha: 1).cgColor

        playerLayer.videoGravity = .resizeAspectFill
        playerLayer.backgroundColor = NSColor.black.cgColor
        layer?.addSublayer(playerLayer)

        // Bottom-heavy readability gradient
        dimLayer.colors = [
            NSColor.clear.cgColor,
            NSColor.black.withAlphaComponent(0.15).cgColor,
            NSColor.black.withAlphaComponent(0.72).cgColor,
            NSColor.black.withAlphaComponent(0.92).cgColor,
        ]
        dimLayer.locations = [0, 0.35, 0.7, 1] as [NSNumber]
        dimLayer.startPoint = CGPoint(x: 0.5, y: 1)
        dimLayer.endPoint = CGPoint(x: 0.5, y: 0)
        layer?.addSublayer(dimLayer)

        // Soft edge vignette
        vignetteLayer.colors = [
            NSColor.black.withAlphaComponent(0.35).cgColor,
            NSColor.clear.cgColor,
            NSColor.clear.cgColor,
            NSColor.black.withAlphaComponent(0.45).cgColor,
        ]
        vignetteLayer.locations = [0, 0.2, 0.8, 1] as [NSNumber]
        vignetteLayer.startPoint = CGPoint(x: 0, y: 0.5)
        vignetteLayer.endPoint = CGPoint(x: 1, y: 0.5)
        layer?.addSublayer(vignetteLayer)

        quoteLabel.font = .systemFont(ofSize: 14, weight: .medium)
        quoteLabel.textColor = .white
        quoteLabel.alignment = .center
        quoteLabel.maximumNumberOfLines = 5
        quoteLabel.lineBreakMode = .byWordWrapping
        quoteLabel.translatesAutoresizingMaskIntoConstraints = false

        attrLabel.font = .systemFont(ofSize: 11, weight: .semibold)
        attrLabel.textColor = NSColor(calibratedRed: 0.90, green: 0.78, blue: 0.45, alpha: 1) // soft gold
        attrLabel.alignment = .center
        attrLabel.translatesAutoresizingMaskIntoConstraints = false

        statusLabel.font = .systemFont(ofSize: 10.5, weight: .medium)
        statusLabel.textColor = NSColor.white.withAlphaComponent(0.55)
        statusLabel.alignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        for v in [quoteLabel, attrLabel, statusLabel] {
            addSubview(v)
        }

        NSLayoutConstraint.activate([
            // Quote sits under the monogram (logo is owned by ControlWindow).
            quoteLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 22),
            quoteLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -22),
            quoteLabel.centerYAnchor.constraint(equalTo: centerYAnchor, constant: 24),

            attrLabel.topAnchor.constraint(equalTo: quoteLabel.bottomAnchor, constant: 10),
            attrLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            attrLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),

            statusLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -72),
            statusLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            statusLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
        ])

        playlist = Self.resolveIntroClips()
        quoteIndex = Int.random(in: 0..<Self.bolivarQuotes.count)
        showQuote(Self.bolivarQuotes[quoteIndex], animated: false)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) unused") }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        playerLayer.frame = bounds
        dimLayer.frame = bounds
        vignetteLayer.frame = bounds
        CATransaction.commit()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window != nil, isPlaying {
            // Resume after panel reattach
            player?.play()
        }
    }

    // MARK: - Public

    func setStatus(_ text: String) {
        statusLabel.stringValue = text
    }

    func startCinema() {
        guard !isPlaying else {
            player?.play()
            return
        }
        isPlaying = true
        isHidden = false
        alphaValue = 1
        startPlayback()
        scheduleQuoteRotation()
        scheduleClipRotation()
    }

    func stopCinema() {
        isPlaying = false
        quoteTimer?.invalidate(); quoteTimer = nil
        clipTimer?.invalidate(); clipTimer = nil
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
        player?.pause()
        player = nil
        looper = nil
        playerLayer.player = nil
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.25
            animator().alphaValue = 0
        } completionHandler: { [weak self] in
            self?.isHidden = true
            self?.alphaValue = 1
        }
    }

    // MARK: - Clips

    private static func resolveIntroClips() -> [URL] {
        let names = ["angel-falls", "canaima", "roraima", "catatumbo"]
        var urls: [URL] = []

        // 1) App bundle Resources/intro (make-app.sh)
        if let res = Bundle.main.resourceURL {
            for n in names {
                let u = res.appendingPathComponent("intro/\(n).mp4")
                if FileManager.default.fileExists(atPath: u.path) { urls.append(u) }
            }
        }

        // 2) SPM resource bundle (swift build / tests)
        #if SWIFT_PACKAGE
        let spm = Bundle.module
        for n in names {
            if let u = spm.url(forResource: n, withExtension: "mp4", subdirectory: "Resources/intro")
                ?? spm.url(forResource: n, withExtension: "mp4", subdirectory: "intro") {
                if !urls.contains(u) { urls.append(u) }
            }
        }
        #endif

        // 3) Dev fallback: source tree next to binary's ancestors
        if urls.isEmpty {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let dev = home.appendingPathComponent(
                "AGB-CRM/macos-helper/Sources/AGBCaptureHelper/Resources/intro"
            )
            for n in names {
                let u = dev.appendingPathComponent("\(n).mp4")
                if FileManager.default.fileExists(atPath: u.path) { urls.append(u) }
            }
        }
        return urls
    }

    private func startPlayback() {
        guard !playlist.isEmpty else {
            // Still show quotes over dark canvas if videos missing
            return
        }
        playClip(at: clipIndex % playlist.count, loopSingle: playlist.count == 1)
    }

    private func playClip(at index: Int, loopSingle: Bool) {
        guard playlist.indices.contains(index) else { return }
        clipIndex = index
        let url = playlist[index]

        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }

        let item = AVPlayerItem(url: url)
        if loopSingle {
            let queue = AVQueuePlayer(playerItem: item)
            // Fresh item for looper
            let template = AVPlayerItem(url: url)
            looper = AVPlayerLooper(player: queue, templateItem: template)
            player = queue
            playerLayer.player = queue
            queue.isMuted = true
            queue.play()
        } else {
            looper = nil
            let p = AVQueuePlayer(playerItem: item)
            player = p
            playerLayer.player = p
            p.isMuted = true
            p.actionAtItemEnd = .none
            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: item,
                queue: .main
            ) { [weak self] _ in
                self?.advanceClip()
            }
            p.play()
        }

        // Soft crossfade when layer already had content
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.35
        fade.toValue = 1
        fade.duration = 0.8
        playerLayer.add(fade, forKey: "clipFade")
    }

    private func advanceClip() {
        guard isPlaying, playlist.count > 1 else { return }
        clipIndex = (clipIndex + 1) % playlist.count
        playClip(at: clipIndex, loopSingle: false)
    }

    private func scheduleClipRotation() {
        clipTimer?.invalidate()
        // Backup rotation if end notification is flaky (some short clips)
        guard playlist.count > 1 else { return }
        clipTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: true) { [weak self] _ in
            self?.advanceClip()
        }
        if let clipTimer {
            RunLoop.main.add(clipTimer, forMode: .common)
        }
    }

    // MARK: - Quotes

    private func scheduleQuoteRotation() {
        quoteTimer?.invalidate()
        quoteTimer = Timer.scheduledTimer(withTimeInterval: 9, repeats: true) { [weak self] _ in
            self?.rotateQuote()
        }
        if let quoteTimer {
            RunLoop.main.add(quoteTimer, forMode: .common)
        }
    }

    private func rotateQuote() {
        let next = (quoteIndex + 1) % Self.bolivarQuotes.count
        quoteIndex = next
        showQuote(Self.bolivarQuotes[next], animated: true)
    }

    private func showQuote(_ q: Quote, animated: Bool) {
        let apply = {
            self.quoteLabel.stringValue = "“\(q.text)”"
            self.attrLabel.stringValue = "— \(q.attribution)"
        }
        guard animated else {
            apply()
            return
        }
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.35
            quoteLabel.animator().alphaValue = 0
            attrLabel.animator().alphaValue = 0
        }, completionHandler: {
            apply()
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.45
                self.quoteLabel.animator().alphaValue = 1
                self.attrLabel.animator().alphaValue = 1
            }
        })
    }

    deinit {
        quoteTimer?.invalidate()
        clipTimer?.invalidate()
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        player?.pause()
    }
}
