package com.readbook.tv.service

object ReadingStateRepair {
    fun shouldClearStaleDailyLimit(
        state: ReadingGateState,
        todayReadingSeconds: Long,
        dailyLimitMinutes: Int
    ): Boolean {
        if (state !is ReadingGateState.PolicyBlocked || state.reason != LockReason.DAILY_LIMIT_EXCEEDED) {
            return false
        }

        val dailyLimitSeconds = dailyLimitMinutes * 60L
        return todayReadingSeconds < dailyLimitSeconds
    }
}
