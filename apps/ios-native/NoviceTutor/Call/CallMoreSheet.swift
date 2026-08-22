import AVKit
import SwiftUI

/// Everything the control bar has no room for, as one pull-up sheet.
///
/// One sheet with three tabs rather than three sheets: mid-lesson the person
/// swapping between "who is here" and "what did they type" is doing one
/// thing, and dismissing a sheet to present another loses the detent and the
/// scroll position every time.
struct CallMoreSheet: View {
    @Bindable var controller: CallController
    @Environment(\.dismiss) private var dismiss

    enum Tab: String, CaseIterable, Identifiable {
        case people = "People"
        case chat = "Chat"
        case settings = "Settings"

        var id: String { rawValue }
    }

    @State var tab: Tab

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $tab) {
                    ForEach(Tab.allCases) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                switch tab {
                case .people: PeopleList(controller: controller)
                case .chat: ChatPane(controller: controller)
                case .settings: SettingsPane(controller: controller)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(.regularMaterial)
        // The chat is only unread while nobody is looking at it.
        .onChange(of: tab, initial: true) { _, tab in
            if tab == .chat { controller.chat.markRead() }
        }
    }
}

// MARK: - People

private struct PeopleList: View {
    let controller: CallController

    var body: some View {
        List {
            Section {
                ForEach(controller.people) { person in
                    PersonRow(controller: controller, person: person)
                }
            } header: {
                Text("\(controller.people.count) in the class")
            }

            if controller.canModerate, !controller.guests.isEmpty {
                Section("Waiting to be let in") {
                    ForEach(controller.guests) { guest in
                        HStack {
                            Text(guest.name)
                            Spacer()
                            Button("Admit") {
                                Task { await controller.answerGuest(guest, admit: true) }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            Button("Deny") {
                                Task { await controller.answerGuest(guest, admit: false) }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }
}

private struct PersonRow: View {
    let controller: CallController
    let person: CallController.Person

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Circle()
                    .fill(person.isSpeaking ? Theme.live : Color.secondary.opacity(0.35))
                    .frame(width: 8, height: 8)

                VStack(alignment: .leading, spacing: 1) {
                    Text(person.isLocal ? "\(person.name) (you)" : person.name)
                        .font(.body.weight(.medium))
                        .lineLimit(1)
                    if person.isHost {
                        Text("Teacher").font(.caption).foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 8)

                Image(systemName: person.micOn ? "mic.fill" : "mic.slash.fill")
                    .foregroundStyle(person.micOn ? AnyShapeStyle(.secondary) : AnyShapeStyle(Color.red))
                Image(systemName: person.cameraOn ? "video.fill" : "video.slash.fill")
                    .foregroundStyle(.secondary)

                if controller.canModerate {
                    Menu {
                        Button(isSpotlighted ? "Remove spotlight" : "Spotlight") {
                            Task { await controller.setSpotlight(isSpotlighted ? nil : person.base) }
                        }
                        if !person.isLocal {
                            if person.micOn {
                                Button("Mute", role: .destructive) {
                                    Task { await controller.mute(person) }
                                }
                            } else {
                                Button("Ask to unmute") {
                                    Task { await controller.askToUnmute(person) }
                                }
                            }
                            if !person.cameraOn {
                                Button("Ask for camera") {
                                    Task { await controller.askForCamera(person) }
                                }
                            }
                            Divider()
                            Button("Remove from class", role: .destructive) {
                                Task { await controller.remove(person) }
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3)
                    }
                }
            }

            // Room-wide, and only a host can move it — which is why it is not
            // shown to anybody else rather than shown disabled: a slider that
            // does nothing reads as a broken app, not as somebody else's
            // control.
            if controller.canModerate, !person.isLocal {
                VolumeRow(person: person) { value in
                    Task { await controller.setVolume(value, for: person.base) }
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var isSpotlighted: Bool { controller.spotlightBase == person.base }
}

/// The quiet alternative to muting somebody: they carry on reciting, the class
/// hears somebody else. Room-wide, so the drag is debounced — every settled
/// value is a write to the room's metadata that every client then applies.
private struct VolumeRow: View {
    let person: CallController.Person
    let onCommit: (Double) -> Void

    @State private var dragging: Double?
    @State private var commit: Task<Void, Never>?

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: shown <= 0.02 ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 18)

            Slider(value: Binding(
                get: { shown },
                set: { value in
                    dragging = value
                    commit?.cancel()
                    commit = Task {
                        // Long enough to swallow a drag, short enough that the
                        // room keeps up with it.
                        try? await Task.sleep(for: .milliseconds(250))
                        guard !Task.isCancelled else { return }
                        onCommit(value)
                    }
                }
            ), in: 0 ... 1)

            Text("\(Int(shown * 100))%")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 40, alignment: .trailing)
        }
        // A value arriving from the room means our own change (or somebody
        // else's) has landed; stop overriding it.
        .onChange(of: person.volume) { _, _ in dragging = nil }
    }

    private var shown: Double { dragging ?? person.volume }
}

// MARK: - Chat

private struct ChatPane: View {
    let controller: CallController
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        if controller.chat.messages.isEmpty {
                            Text("Messages sent here reach everyone in the class. They aren't saved after it ends.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.top, 32)
                        }
                        ForEach(controller.chat.messages) { message in
                            MessageBubble(message: message).id(message.id)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .onChange(of: controller.chat.messages.count) { _, _ in
                    guard let last = controller.chat.messages.last else { return }
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }

            HStack(spacing: 8) {
                TextField("Message the class", text: $draft, axis: .vertical)
                    .lineLimit(1 ... 4)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit(send)

                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }

    private func send() {
        let text = draft
        draft = ""
        Task { await controller.chat.send(text) }
    }
}

private struct MessageBubble: View {
    let message: CallChat.Message

    var body: some View {
        VStack(alignment: message.isMine ? .trailing : .leading, spacing: 3) {
            Text(message.isMine ? "You" : message.senderName)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(message.body)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    message.isMine ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Color.primary.opacity(0.08)),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .foregroundStyle(message.isMine ? .white : .primary)
        }
        .frame(maxWidth: .infinity, alignment: message.isMine ? .trailing : .leading)
    }
}

// MARK: - Settings

private struct SettingsPane: View {
    @Bindable var controller: CallController

    var body: some View {
        List {
            Section("View") {
                Picker("Layout", selection: $controller.layout) {
                    Label("Speaker", systemImage: "person.crop.rectangle")
                        .tag(CallController.Layout.speaker)
                    Label("Grid", systemImage: "square.grid.2x2")
                        .tag(CallController.Layout.grid)
                }
                .pickerStyle(.segmented)
            }

            Section {
                Toggle(isOn: Binding(
                    get: { controller.backgroundBlurred },
                    set: { controller.setBackgroundBlur($0) }
                )) {
                    Label("Blur my background", systemImage: "person.and.background.dotted")
                }
                .disabled(controller.cameraDenied)
            } footer: {
                Text("Blurring runs on this phone. On an older device it can warm the phone up and cost some frames.")
            }

            Section("Sound") {
                HStack {
                    Label("Output", systemImage: "speaker.wave.2")
                    Spacer()
                    AudioRoutePicker()
                        .frame(width: 40, height: 40)
                }
            }

            if controller.micDenied || controller.cameraDenied {
                Section {
                    Button("Open Settings") { MediaPermissions.openSettings() }
                } footer: {
                    Text(controller.micDenied && controller.cameraDenied
                        ? "Camera and microphone access are off for Novice Tutor."
                        : controller.micDenied
                        ? "Microphone access is off for Novice Tutor."
                        : "Camera access is off for Novice Tutor.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }
}

/// iOS has no camera or microphone *picker* worth writing: the camera is front
/// or back (that is the flip button), and the microphone follows the audio
/// route. This is the system's own route picker, which is also the only way to
/// reach AirPods and the speaker without leaving the app.
private struct AudioRoutePicker: UIViewRepresentable {
    func makeUIView(context _: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.prioritizesVideoDevices = false
        view.activeTintColor = UIColor(Theme.accent)
        return view
    }

    func updateUIView(_: AVRoutePickerView, context _: Context) {}
}
