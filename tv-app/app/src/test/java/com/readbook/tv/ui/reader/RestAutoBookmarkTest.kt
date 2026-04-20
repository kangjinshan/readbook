package com.readbook.tv.ui.reader

import com.readbook.tv.service.LockReason
import com.readbook.tv.service.ReadingGateState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RestAutoBookmarkTest {

    @Test
    fun `creates bookmark only for continuous rest lock`() {
        val state = ReadingGateState.TemporaryLock(
            reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
            message = "请休息一下",
            untilEpochMillis = 1_000L
        )

        assertTrue(RestAutoBookmark.shouldCreateFor(state))
    }

    @Test
    fun `does not create bookmark for non rest gate states`() {
        val state = ReadingGateState.PolicyBlocked(
            reason = LockReason.DAILY_LIMIT_EXCEEDED,
            message = "今日阅读时长已达上限",
            recheckAtEpochMillis = null
        )

        assertFalse(RestAutoBookmark.shouldCreateFor(state))
    }

    @Test
    fun `builds compact preview from current page content`() {
        val preview = RestAutoBookmark.buildPreview(
            "  第一段\n\n  第二段  第三段  "
        )

        assertEquals("第一段 第二段 第三段", preview)
    }

    @Test
    fun `returns null for blank page content`() {
        assertNull(RestAutoBookmark.buildPreview("   \n\t  "))
    }
}
