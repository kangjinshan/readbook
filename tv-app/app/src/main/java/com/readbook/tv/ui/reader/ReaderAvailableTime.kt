package com.readbook.tv.ui.reader

object ReaderAvailableTime {
    fun remainingReadableSeconds(
        dailyLimitMinutes: Int,
        todayReadingSeconds: Long,
        continuousLimitMinutes: Int,
        continuousReadingSeconds: Long
    ): Long {
        val dailyRemainingSeconds = (dailyLimitMinutes * 60L - todayReadingSeconds).coerceAtLeast(0L)
        val continuousRemainingSeconds = (continuousLimitMinutes * 60L - continuousReadingSeconds).coerceAtLeast(0L)
        return minOf(dailyRemainingSeconds, continuousRemainingSeconds)
    }
}
