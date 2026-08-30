import SwiftUI

/// Фирменный знак Zyng — угловатая «молния».
///
/// Рисуется фигурой, а не картинкой: масштабируется без потери чёткости на
/// любом размере и перекрашивается под состояние, не заводя отдельный ассет
/// под каждый цвет.
struct ZyngMark: Shape {

    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height

        // Точки заданы долями стороны, поэтому знак одинаков на любом размере.
        let points = [
            CGPoint(x: rect.minX + w * 0.36, y: rect.minY + h * 0.20),
            CGPoint(x: rect.minX + w * 0.68, y: rect.minY + h * 0.42),
            CGPoint(x: rect.minX + w * 0.40, y: rect.minY + h * 0.57),
            CGPoint(x: rect.minX + w * 0.68, y: rect.minY + h * 0.80)
        ]

        var line = Path()
        line.move(to: points[0])
        for point in points.dropFirst() {
            line.addLine(to: point)
        }

        // Толщина тоже в долях: иначе на маленьком размере знак превращается
        // в кляксу, а на большом — в ниточку.
        return line.strokedPath(
            StrokeStyle(lineWidth: min(w, h) * 0.17, lineCap: .round, lineJoin: .round)
        )
    }
}

/// Знак в скруглённом квадрате — то, что стоит в шапке и на иконке.
struct ZyngLogo: View {

    var size: CGFloat = 34
    var background: LinearGradient = LinearGradient(
        colors: [JT.accent, Color(hex: "7A5CFF")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .fill(background)

            ZyngMark()
                .fill(.white)
                .frame(width: size * 0.86, height: size * 0.86)
        }
        .frame(width: size, height: size)
    }
}
