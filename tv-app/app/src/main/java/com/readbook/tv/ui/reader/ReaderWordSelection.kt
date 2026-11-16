package com.readbook.tv.ui.reader

data class ReaderWordSelection(val word: String, val context: String, val selectionStart: Int)

data class ReaderWordBox(val token: Int, val line: Int, val left: Float, val right: Float, val top: Float, val bottom: Float) {
    val centerX: Float get() = (left + right) / 2
}

object ReaderWordNavigation {
    fun verticalTarget(boxes: List<ReaderWordBox>, current: ReaderWordBox, direction: Int, x: Float): ReaderWordBox? {
        val rows = boxes.groupBy { it.line }.values.sortedBy { row -> row.minOf { it.top } }
        val rowIndex = rows.indexOfFirst { row -> row.any { it.line == current.line } }
        val target = rows.getOrNull(rowIndex + if (direction < 0) -1 else 1) ?: return null
        return target.minWithOrNull(compareBy<ReaderWordBox> {
            when { x < it.left -> it.left - x; x > it.right -> x - it.right; else -> 0f }
        }.thenBy { kotlin.math.abs(it.centerX - x) })
    }
}

object ReaderWords {
    val pattern = Regex("[A-Za-z]+(?:['’\\-][A-Za-z]+)*")

    fun ranges(text: String): List<IntRange> = pattern.findAll(text)
        .filter { it.value.length <= 64 }.map { it.range }.toList()

    fun at(text: String, offset: Int): ReaderWordSelection? =
        ranges(text).firstOrNull { offset in it }?.let { selection(text, it) }

    fun selection(text: String, range: IntRange): ReaderWordSelection {
        var start = (range.first - 180).coerceAtLeast(0)
        var end = (range.last + 181).coerceAtMost(text.length)
        if (start > 0 && text[start].isLowSurrogate()) start++
        if (end < text.length && text[end - 1].isHighSurrogate()) end--
        return ReaderWordSelection(text.substring(range), text.substring(start, end), range.first - start)
    }
}
