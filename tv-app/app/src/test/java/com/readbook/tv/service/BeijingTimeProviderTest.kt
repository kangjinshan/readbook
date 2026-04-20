package com.readbook.tv.service

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BeijingTimeProviderTest {

    private val provider = BeijingTimeProvider()

    @Test
    fun `isWithinForbiddenWindow handles overnight Beijing ranges`() {
        val now = Instant.parse("2026-04-18T14:30:00Z") // Beijing 22:30

        assertTrue(
            provider.isWithinForbiddenWindow(
                now = now,
                forbiddenStart = "22:00",
                forbiddenEnd = "07:30"
            )
        )
    }

    @Test
    fun `nextBeijingMidnight returns the next local midnight in Asia Shanghai`() {
        val now = Instant.parse("2026-04-18T15:10:00Z") // Beijing 23:10
        val nextMidnight = provider.nextBeijingMidnight(now)

        assertEquals("2026-04-18T16:00:00Z", nextMidnight.toString())
    }

    @Test
    fun `nextAllowedInstant accepts non zero padded forbidden end time`() {
        val now = Instant.parse("2026-04-18T14:30:00Z") // Beijing 22:30

        assertEquals(
            "2026-04-18T23:30:00Z",
            provider.nextAllowedInstant(now, "7:30")?.toString()
        )
    }

    @Test
    fun `invalid forbidden time strings fail closed without throwing`() {
        val now = Instant.parse("2026-04-18T14:30:00Z") // Beijing 22:30

        assertFalse(
            provider.isWithinForbiddenWindow(
                now = now,
                forbiddenStart = "22:60",
                forbiddenEnd = "07:30"
            )
        )
        assertNull(provider.nextAllowedInstant(now, "07:99"))
    }

    @Test
    fun `forbidden window start is inclusive and end is exclusive`() {
        val startBoundary = Instant.parse("2026-04-18T01:00:00Z") // Beijing 09:00
        val endBoundary = Instant.parse("2026-04-18T03:00:00Z") // Beijing 11:00

        assertTrue(provider.isWithinForbiddenWindow(startBoundary, "09:00", "11:00"))
        assertFalse(provider.isWithinForbiddenWindow(endBoundary, "09:00", "11:00"))
    }
}
