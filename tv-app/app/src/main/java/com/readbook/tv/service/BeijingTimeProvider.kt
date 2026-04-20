package com.readbook.tv.service

import com.readbook.tv.data.model.ControlPolicy
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

open class BeijingTimeProvider(
    private val zoneId: ZoneId = ZoneId.of("Asia/Shanghai")
) {
    open fun currentInstant(): Instant = Instant.now()

    fun currentBeijingDate(now: Instant = currentInstant()): LocalDate =
        now.atZone(zoneId).toLocalDate()

    fun currentMinutes(now: Instant = currentInstant()): Int {
        val local = now.atZone(zoneId).toLocalTime()
        return local.hour * 60 + local.minute
    }

    fun isWithinForbiddenWindow(now: Instant, forbiddenStart: String?, forbiddenEnd: String?): Boolean {
        val start = parseTime(forbiddenStart) ?: return false
        val end = parseTime(forbiddenEnd) ?: return false
        val current = currentMinutes(now)
        val startMinutes = start.hour * 60 + start.minute
        val endMinutes = end.hour * 60 + end.minute
        return if (startMinutes > endMinutes) {
            current >= startMinutes || current < endMinutes
        } else {
            current in startMinutes until endMinutes
        }
    }

    fun nextBeijingMidnight(now: Instant = currentInstant()): Instant =
        currentBeijingDate(now).plusDays(1).atStartOfDay(zoneId).toInstant()

    fun nextAllowedInstant(now: Instant, forbiddenEnd: String?): Instant? {
        val end = parseTime(forbiddenEnd) ?: return null
        val date = currentBeijingDate(now)
        val currentTime = now.atZone(zoneId).toLocalTime()
        val targetDate = if (currentTime < end) date else date.plusDays(1)
        return ZonedDateTime.of(targetDate, end, zoneId).toInstant()
    }

    private fun parseTime(raw: String?): LocalTime? =
        raw?.split(":")?.takeIf { it.size == 2 }?.let { parts ->
            val hour = parts[0].toIntOrNull() ?: return null
            val minute = parts[1].toIntOrNull() ?: return null
            if (hour !in 0..23 || minute !in 0..59) {
                return null
            }
            LocalTime.of(hour, minute)
        }
}

fun ControlPolicy.isForbiddenTime(timeProvider: BeijingTimeProvider = BeijingTimeProvider()): Boolean =
    timeProvider.isWithinForbiddenWindow(
        now = timeProvider.currentInstant(),
        forbiddenStart = forbiddenStartTime,
        forbiddenEnd = forbiddenEndTime
    )
