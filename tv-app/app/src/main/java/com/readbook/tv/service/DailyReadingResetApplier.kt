package com.readbook.tv.service

interface DailyReadingResetPreferences {
    var todayReadingSeconds: Long
    var continuousReadingSeconds: Long
    var todayDate: String?
    var lastAppliedDailyReadingResetEpochMs: Long
}

class DailyReadingResetApplier(
    private val preferences: DailyReadingResetPreferences,
    private val beijingTimeProvider: BeijingTimeProvider,
    private val readingControlCoordinator: ReadingControlCoordinator
) {
    fun applyIfDayChanged(): ReadingGateState? {
        val today = beijingTimeProvider.currentBeijingDate().toString()
        if (preferences.todayDate == today) {
            return null
        }

        preferences.todayDate = today
        preferences.todayReadingSeconds = 0L
        preferences.continuousReadingSeconds = 0L
        return readingControlCoordinator.handleDailyReadingReset(beijingTimeProvider.currentInstant())
    }

    fun applyIfNew(resetAtEpochMillis: Long?): ReadingGateState? {
        if (resetAtEpochMillis == null || resetAtEpochMillis <= preferences.lastAppliedDailyReadingResetEpochMs) {
            return null
        }

        preferences.lastAppliedDailyReadingResetEpochMs = resetAtEpochMillis
        preferences.todayDate = beijingTimeProvider.currentBeijingDate().toString()
        preferences.todayReadingSeconds = 0L
        preferences.continuousReadingSeconds = 0L
        return readingControlCoordinator.handleDailyReadingReset(beijingTimeProvider.currentInstant())
    }
}
