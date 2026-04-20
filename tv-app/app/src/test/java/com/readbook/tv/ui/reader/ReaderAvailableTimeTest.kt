package com.readbook.tv.ui.reader

import org.junit.Assert.assertEquals
import org.junit.Test

class ReaderAvailableTimeTest {

    @Test
    fun `uses smaller of daily and continuous remaining`() {
        assertEquals(
            300L,
            ReaderAvailableTime.remainingReadableSeconds(
                dailyLimitMinutes = 30,
                todayReadingSeconds = 5 * 60L,
                continuousLimitMinutes = 10,
                continuousReadingSeconds = 5 * 60L
            )
        )
    }

    @Test
    fun `returns zero when daily limit is exhausted`() {
        assertEquals(
            0L,
            ReaderAvailableTime.remainingReadableSeconds(
                dailyLimitMinutes = 20,
                todayReadingSeconds = 20 * 60L,
                continuousLimitMinutes = 45,
                continuousReadingSeconds = 10 * 60L
            )
        )
    }

    @Test
    fun `returns zero when continuous limit is exhausted`() {
        assertEquals(
            0L,
            ReaderAvailableTime.remainingReadableSeconds(
                dailyLimitMinutes = 120,
                todayReadingSeconds = 20 * 60L,
                continuousLimitMinutes = 15,
                continuousReadingSeconds = 15 * 60L
            )
        )
    }
}
