package com.readbook.tv.ui.reader

import org.junit.Assert.*
import org.junit.Test

class ReaderWordNavigationTest {
    private fun box(token: Int, line: Int, x: Float, width: Float = 40f) =
        ReaderWordBox(token, line, x, x + width, line * 50f, line * 50f + 30f)

    @Test fun movesOneVisualRowAndKeepsHorizontalAnchorAcrossShortRows() {
        val boxes = listOf(box(0,0,0f),box(1,0,180f),box(2,1,0f),box(3,2,0f),box(4,2,180f))
        val first = boxes[1]
        val down = ReaderWordNavigation.verticalTarget(boxes,first,1,first.centerX)!!
        assertEquals(2,down.token)
        assertEquals(4,ReaderWordNavigation.verticalTarget(boxes,down,1,first.centerX)!!.token)
        assertEquals(1,ReaderWordNavigation.verticalTarget(boxes,down,-1,first.centerX)!!.token)
    }

    @Test fun choosesTheWordUnderTheAnchorAndStaysAtPageEdges() {
        val boxes = listOf(box(0,0,100f),box(1,1,0f,150f),box(2,1,160f))
        assertEquals(1,ReaderWordNavigation.verticalTarget(boxes,boxes[0],1,120f)!!.token)
        assertNull(ReaderWordNavigation.verticalTarget(boxes,boxes[0],-1,120f))
        assertNull(ReaderWordNavigation.verticalTarget(boxes,boxes[1],1,120f))
    }

    @Test fun skipsBlankAndImageRowsButDoesNotSkipSelectableRows() {
        val boxes = listOf(box(0,0,100f),box(1,3,90f),box(2,7,100f))
        assertEquals(1,ReaderWordNavigation.verticalTarget(boxes,boxes[0],1,120f)!!.token)
    }
}
