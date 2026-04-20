package com.readbook.tv.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LockStateStoreTest {

    private val now = 1_000_000L

    private data class InMemoryGatePreferences(
        override var gateStateType: String? = null,
        override var gateReason: String? = null,
        override var gateMessage: String? = null,
        override var gateUntilEpochMs: Long = 0L,
        override var gateRecheckEpochMs: Long = 0L,
        override var lockEndTime: Long = 0L
    ) : GateStatePreferences

    private class RecordingGatePreferences : GateStatePreferences {
        private val values = linkedMapOf<String, Any?>(
            "gateStateType" to null,
            "gateReason" to null,
            "gateMessage" to null,
            "gateUntilEpochMs" to 0L,
            "gateRecheckEpochMs" to 0L,
            "lockEndTime" to 0L
        )

        val writes = mutableListOf<String>()

        override var gateStateType: String?
            get() = values["gateStateType"] as String?
            set(value) {
                writes += "gateStateType"
                values["gateStateType"] = value
            }

        override var gateReason: String?
            get() = values["gateReason"] as String?
            set(value) {
                writes += "gateReason"
                values["gateReason"] = value
            }

        override var gateMessage: String?
            get() = values["gateMessage"] as String?
            set(value) {
                writes += "gateMessage"
                values["gateMessage"] = value
            }

        override var gateUntilEpochMs: Long
            get() = values["gateUntilEpochMs"] as Long
            set(value) {
                writes += "gateUntilEpochMs"
                values["gateUntilEpochMs"] = value
            }

        override var gateRecheckEpochMs: Long
            get() = values["gateRecheckEpochMs"] as Long
            set(value) {
                writes += "gateRecheckEpochMs"
                values["gateRecheckEpochMs"] = value
            }

        override var lockEndTime: Long
            get() = values["lockEndTime"] as Long
            set(value) {
                writes += "lockEndTime"
                values["lockEndTime"] = value
            }
    }

    @Test
    fun `restores temporary lock from stored fields`() {
        val untilEpochMs = now + 123_000L
        val prefs = InMemoryGatePreferences(
            gateStateType = "temporary",
            gateReason = "CONTINUOUS_LIMIT_EXCEEDED",
            gateMessage = "请休息一下",
            gateUntilEpochMs = untilEpochMs
        )

        val store = LockStateStore(prefs) { now }

        assertEquals(
            ReadingGateState.TemporaryLock(
                reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
                message = "请休息一下",
                untilEpochMillis = untilEpochMs
            ),
            store.read()
        )
    }

    @Test
    fun `migrates legacy future lock end time into temporary lock`() {
        val futureEndTime = now + 60_000L
        val prefs = InMemoryGatePreferences(lockEndTime = futureEndTime)

        val store = LockStateStore(prefs) { now }

        assertEquals(
            ReadingGateState.TemporaryLock(
                reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
                message = "请休息一下",
                untilEpochMillis = futureEndTime
            ),
            store.read()
        )
        assertEquals("temporary", prefs.gateStateType)
        assertEquals(futureEndTime, prefs.gateUntilEpochMs)
    }

    @Test
    fun `restores policy blocked state from stored fields`() {
        val prefs = InMemoryGatePreferences(
            gateStateType = "blocked",
            gateReason = "FORBIDDEN_TIME",
            gateMessage = "当前为禁止阅读时段",
            gateRecheckEpochMs = 456_000L
        )

        val store = LockStateStore(prefs) { now }

        assertEquals(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.FORBIDDEN_TIME,
                message = "当前为禁止阅读时段",
                recheckAtEpochMillis = 456_000L
            ),
            store.read()
        )
    }

    @Test
    fun `expired persisted temporary lock is cleared and returns unlocked`() {
        val prefs = InMemoryGatePreferences(
            gateStateType = "temporary",
            gateReason = "CONTINUOUS_LIMIT_EXCEEDED",
            gateMessage = "请休息一下",
            gateUntilEpochMs = now - 1_000L
        )

        val store = LockStateStore(prefs) { now }

        assertEquals(ReadingGateState.Unlocked, store.read())
        assertNull(prefs.gateStateType)
        assertEquals(0L, prefs.gateUntilEpochMs)
        assertEquals(0L, prefs.lockEndTime)
    }

    @Test
    fun `temporary lock writes gate marker last`() {
        val prefs = RecordingGatePreferences()
        val store = LockStateStore(prefs) { now }

        store.write(
            ReadingGateState.TemporaryLock(
                reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
                message = "请休息一下",
                untilEpochMillis = 123_000L
            )
        )

        assertTrue(prefs.writes.isNotEmpty())
        assertEquals("gateStateType", prefs.writes.last())
    }

    @Test
    fun `expired legacy lock end time is cleared and returns unlocked`() {
        val prefs = InMemoryGatePreferences(lockEndTime = now - 1_000L)

        val store = LockStateStore(prefs) { now }

        assertEquals(ReadingGateState.Unlocked, store.read())
        assertEquals(0L, prefs.lockEndTime)
        assertNull(prefs.gateStateType)
    }

    @Test
    fun `clear resets persisted state`() {
        val prefs = InMemoryGatePreferences(
            gateStateType = "blocked",
            gateReason = "FORBIDDEN_TIME",
            gateMessage = "当前不允许阅读",
            gateRecheckEpochMs = 456_000L,
            lockEndTime = 789_000L
        )

        val store = LockStateStore(prefs) { now }
        store.clear()

        assertEquals(ReadingGateState.Unlocked, store.read())
        assertNull(prefs.gateStateType)
        assertNull(prefs.gateReason)
        assertNull(prefs.gateMessage)
        assertEquals(0L, prefs.gateUntilEpochMs)
        assertEquals(0L, prefs.gateRecheckEpochMs)
    }
}
