package com.readbook.tv.ui.lock

import org.junit.Assert.assertEquals
import org.junit.Test

class LockDurationFormatterTest {

    @Test
    fun formatsZeroSecondsAsFullClock() {
        assertEquals("00:00:00", LockDurationFormatter.format(0))
    }

    @Test
    fun formatsMinutesWithoutInflatingHours() {
        assertEquals("00:05:00", LockDurationFormatter.format(300))
    }

    @Test
    fun formatsHoursMinutesAndSeconds() {
        assertEquals("01:05:09", LockDurationFormatter.format(3909))
    }
}
