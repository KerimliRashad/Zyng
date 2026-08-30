import SwiftUI

@main
struct ZyngApp: App {
    var body: some Scene {
        WindowGroup {
            // Тему выбирает пользователь — ContentView применяет её сам.
            // Жёсткое .dark здесь перекрывало этот выбор.
            ContentView()
        }
    }
}
