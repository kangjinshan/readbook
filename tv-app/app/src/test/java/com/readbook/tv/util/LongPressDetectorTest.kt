package com.readbook.tv.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LongPressDetectorTest {

    @Test
    fun `treats short press as confirm`() {
        val detector = LongPressDetector(thresholdMs = 500L)

        detector.onKeyDown(downTimeMs = 1_000L)

        assertFalse(detector.onKeyUp(eventTimeMs = 1_300L))
    }

    @Test
    fun `keeps original down time across repeated key down events`() {
        val detector = LongPressDetector(thresholdMs = 500L)

        detector.onKeyDown(downTimeMs = 2_000L)
        detector.onKeyDown(downTimeMs = 2_000L)

        assertTrue(detector.onKeyUp(eventTimeMs = 2_650L))
    }
}
