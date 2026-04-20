package com.readbook.tv.ui.reader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderPageBreaksTest {

    @Test
    fun `pulls quote into previous page instead of moving previous text to next page`() {
        val text = "前页句号。“下一页对白"
        val fittedEnd = text.indexOf("下一")
        val quoteIndex = text.indexOf('“')

        val adjusted = ReaderPageBreaks.adjustBreakPoint(
            text = text,
            start = 0,
            fittedEnd = fittedEnd
        )

        assertTrue(adjusted > quoteIndex)
        assertFalse(ReaderPageBreaks.isForbiddenLeadingChar(text[adjusted]))
    }

    @Test
    fun `keeps fitted end when next page already starts safely`() {
        val text = "第一段结束。第二段开头"
        val fittedEnd = text.indexOf("第二段开头")

        val adjusted = ReaderPageBreaks.adjustBreakPoint(
            text = text,
            start = 0,
            fittedEnd = fittedEnd
        )

        assertEquals(fittedEnd, adjusted)
    }
}
