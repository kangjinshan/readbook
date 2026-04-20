package com.readbook.tv.service

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadingStateRepairTest {

    @Test
    fun `clears stale daily limit when todays counter is below limit`() {
        assertTrue(
            ReadingStateRepair.shouldClearStaleDailyLimit(
                state = ReadingGateState.PolicyBlocked(
                    reason = LockReason.DAILY_LIMIT_EXCEEDED,
                    message = "今日阅读时长已达上限",
                    recheckAtEpochMillis = 1L
                ),
                todayReadingSeconds = 0L,
                dailyLimitMinutes = 480
            )
        )
    }

    @Test
    fun `keeps daily limit lock when todays counter is still at limit`() {
        assertFalse(
            ReadingStateRepair.shouldClearStaleDailyLimit(
                state = ReadingGateState.PolicyBlocked(
                    reason = LockReason.DAILY_LIMIT_EXCEEDED,
                    message = "今日阅读时长已达上限",
                    recheckAtEpochMillis = 1L
                ),
                todayReadingSeconds = 480 * 60L,
                dailyLimitMinutes = 480
            )
        )
    }

    @Test
    fun `ignores non daily limit states`() {
        assertFalse(
            ReadingStateRepair.shouldClearStaleDailyLimit(
                state = ReadingGateState.PolicyBlocked(
                    reason = LockReason.FORBIDDEN_TIME,
                    message = "当前为禁止阅读时段",
                    recheckAtEpochMillis = 1L
                ),
                todayReadingSeconds = 0L,
                dailyLimitMinutes = 480
            )
        )
    }
}
