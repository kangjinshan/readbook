package com.readbook.tv.ui.reader

import org.junit.Assert.assertEquals
import org.junit.Test

class ReaderBrightnessTest {

    @Test
    fun `maps preset to overlay alpha`() {
        assertEquals(0.30f, ReaderBrightness.DIM_30.overlayAlpha, 0.001f)
        assertEquals(0f, ReaderBrightness.BRIGHT.overlayAlpha, 0.001f)
    }
}
