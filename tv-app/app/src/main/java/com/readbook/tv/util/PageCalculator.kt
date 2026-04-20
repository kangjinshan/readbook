package com.readbook.tv.util

import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
/**
 * 分页计算器
 * 使用真实可视区域与系统排版结果分页，避免半行和断句问题。
 */
class PageCalculator {

    fun calculatePages(
        content: String,
        textSizePx: Float,
        availableWidthPx: Int,
        availableHeightPx: Int,
        lineSpacingMultiplier: Float
    ): List<String> {
        val normalizedContent = normalizeContent(content)
        if (normalizedContent.isBlank() || availableWidthPx <= 0 || availableHeightPx <= 0) {
            return listOf(normalizedContent.ifBlank { "" })
        }

        val textPaint = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
            textSize = textSizePx
        }
        val layout = buildLayout(
            text = normalizedContent,
            paint = textPaint,
            width = availableWidthPx,
            lineSpacingMultiplier = lineSpacingMultiplier
        )

        if (layout.lineCount == 0) {
            return listOf(normalizedContent)
        }

        val pages = mutableListOf<String>()
        var startOffset = 0

        while (startOffset < normalizedContent.length) {
            val fittedEnd = findLargestFittingEnd(
                text = normalizedContent,
                startOffset = startOffset,
                paint = textPaint,
                width = availableWidthPx,
                height = availableHeightPx,
                lineSpacingMultiplier = lineSpacingMultiplier
            )

            if (fittedEnd <= startOffset) {
                val forcedEnd = minOf(startOffset + 1, normalizedContent.length)
                pages.add(normalizedContent.substring(startOffset, forcedEnd))
                startOffset = forcedEnd
                continue
            }

            val adjustedEnd = adjustBreakPoint(normalizedContent, startOffset, fittedEnd)
            val pageText = normalizedContent
                .substring(startOffset, adjustedEnd)
                .trimEnd('\n')

            if (pageText.isNotBlank()) {
                pages.add(pageText)
            }

            startOffset = adjustedEnd
            while (startOffset < normalizedContent.length && normalizedContent[startOffset] == '\n') {
                startOffset++
            }
        }

        return pages.ifEmpty { listOf(normalizedContent) }
    }

    private fun findLargestFittingEnd(
        text: String,
        startOffset: Int,
        paint: TextPaint,
        width: Int,
        height: Int,
        lineSpacingMultiplier: Float
    ): Int {
        var low = startOffset + 1
        var high = text.length
        var best = startOffset

        while (low <= high) {
            val mid = (low + high) ushr 1
            val candidate = text.substring(startOffset, mid)
            val layout = buildLayout(candidate, paint, width, lineSpacingMultiplier)

            if (layout.height <= height) {
                best = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        return best
    }

    private fun adjustBreakPoint(text: String, startOffset: Int, fittedEnd: Int): Int {
        val searchWindow = 48
        val lowerBound = maxOf(startOffset + 1, fittedEnd - searchWindow)

        for (index in fittedEnd downTo lowerBound) {
            val char = text[index - 1]
            if (char == '\n' || char == '。' || char == '！' || char == '？' ||
                char == '；' || char == '：' || char == '，' || char == '、' ||
                char == '.' || char == '!' || char == '?' || char == ';' || char == ',' || char == ' '
            ) {
                return index
            }
        }

        return fittedEnd
    }

    private fun buildLayout(
        text: String,
        paint: TextPaint,
        width: Int,
        lineSpacingMultiplier: Float
    ): StaticLayout {
        val builder = StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(false)
            .setLineSpacing(0f, lineSpacingMultiplier)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.setBreakStrategy(Layout.BREAK_STRATEGY_HIGH_QUALITY)
            builder.setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
        }

        return builder.build()
    }

    private fun normalizeContent(content: String): String {
        return content
            .replace("\r\n", "\n")
            .replace(Regex("[\\t\\x0B\\f]+"), " ")
            .replace(Regex("[ ]+\n"), "\n")
            .replace(Regex("\n[ ]+"), "\n")
            .replace(Regex("\n{2,}"), "\n")
            .lines()
            .joinToString("\n") { it.trimEnd() }
            .trim()
    }
}
