package com.readbook.tv.ui.reader

object ReaderPageBreaks {
    private val preferredBreakChars = setOf(
        '\n', '。', '！', '？', '；', '：', '，', '、', '.', '!', '?', ';', ',', ' '
    )

    private val carryToPreviousPageChars = setOf(
        '“', '”', '‘', '’', '"', '\'',
        '（', '）', '(', ')',
        '【', '】', '[', ']',
        '《', '》', '<', '>',
        '「', '」', '『', '』',
        '、', '，', '。', '！', '？', '；', '：', ',', '.', '!', '?', ';', ':'
    )

    fun adjustBreakPoint(
        text: String,
        start: Int,
        fittedEnd: Int,
        searchWindow: Int = 48
    ): Int {
        if (text.isEmpty()) {
            return 0
        }

        val boundedEnd = fittedEnd.coerceIn(start + 1, text.length)
        val preferred = findPreferredBreak(text, start, boundedEnd, searchWindow)
        return pullLeadingCharsIntoCurrentPage(text, preferred, boundedEnd)
    }

    fun isForbiddenLeadingChar(char: Char): Boolean = char in carryToPreviousPageChars

    private fun findPreferredBreak(text: String, start: Int, fittedEnd: Int, searchWindow: Int): Int {
        val lowerBound = maxOf(start + 1, fittedEnd - searchWindow)
        for (index in fittedEnd downTo lowerBound) {
            if (text[index - 1] in preferredBreakChars) {
                return index
            }
        }
        return fittedEnd
    }

    private fun pullLeadingCharsIntoCurrentPage(text: String, preferredEnd: Int, fittedEnd: Int): Int {
        var candidate = preferredEnd
        while (candidate < fittedEnd && candidate < text.length && isForbiddenLeadingChar(text[candidate])) {
            candidate++
        }
        return candidate
    }
}
