package com.readbook.tv.ui.shelf

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShelfExitGuardTest {

    @Test
    fun `exits on second back press within window`() {
        assertTrue(
            ShelfExitGuard.shouldExit(
                lastBackPressedAtMs = 1_000L,
                nowMs = 2_500L
            )
        )
    }

    @Test
    fun `does not exit on first back press`() {
        assertFalse(
            ShelfExitGuard.shouldExit(
                lastBackPressedAtMs = 0L,
                nowMs = 1_000L
            )
        )
    }

    @Test
    fun `does not exit after window expires`() {
        assertFalse(
            ShelfExitGuard.shouldExit(
                lastBackPressedAtMs = 1_000L,
                nowMs = 3_100L
            )
        )
    }
}
