package com.readbook.tv.ui.reader

import org.junit.Assert.*
import org.junit.Test

class ReaderWordsTest {
    @Test fun punctuationNamesAndContractionsPreserveOriginalCase() {
        val text = "Harry’s well-known dog can't fly. 中文"
        assertEquals(listOf("Harry’s", "well-known", "dog", "can't", "fly"),
            ReaderWords.ranges(text).map { text.substring(it) })
        assertNull(ReaderWords.at(text, text.indexOf('.')))
        assertNull(ReaderWords.at(text, text.indexOf('中')))
    }

    @Test fun boundedContextAlwaysPointsAtTheClickedOccurrence() {
        val text = "word ".repeat(70) + "Will said, ‘will you come?’ " + "end ".repeat(80)
        val offset = text.indexOf("will you")
        val selection = ReaderWords.at(text, offset)!!
        assertEquals("will", selection.word)
        assertTrue(selection.context.length <= 424)
        assertEquals(selection.word, selection.context.substring(selection.selectionStart,
            selection.selectionStart + selection.word.length))
    }

    @Test fun emojiOffsetsStayUtf16AndLongTokensAreIgnored() {
        val selected = ReaderWords.at("😀 apple", 3)!!
        assertEquals(3, selected.selectionStart)
        assertEquals("apple", selected.word)
        assertTrue(ReaderWords.ranges("a".repeat(65)).isEmpty())
    }
}
