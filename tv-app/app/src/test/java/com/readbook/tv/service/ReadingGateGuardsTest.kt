package com.readbook.tv.service

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadingGateGuardsTest {

    @Test
    fun `guard denies reader entry when gate state is blocked`() {
        val gateState = ReadingGateState.PolicyBlocked(
            reason = LockReason.DAILY_LIMIT_EXCEEDED,
            message = "今日阅读时长已达上限",
            recheckAtEpochMillis = 1_000L
        )

        assertFalse(ReadingGateGuards.canEnterReader(gateState))
    }

    @Test
    fun `guard denies reader entry when gate state is temporary lock`() {
        val gateState = ReadingGateState.TemporaryLock(
            reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
            message = "请休息一下",
            untilEpochMillis = 1_000L
        )

        assertFalse(ReadingGateGuards.canEnterReader(gateState))
    }

    @Test
    fun `guard allows reader entry when gate state is unlocked`() {
        assertTrue(ReadingGateGuards.canEnterReader(ReadingGateState.Unlocked))
    }
}
