package com.readbook.tv.ui.reader

import com.readbook.tv.service.LockReason
import com.readbook.tv.service.ReadingGateState

object RestAutoBookmark {
    private const val PREVIEW_LENGTH = 50
    private val whitespaceRegex = Regex("\\s+")

    fun shouldCreateFor(state: ReadingGateState): Boolean =
        state is ReadingGateState.TemporaryLock &&
            state.reason == LockReason.CONTINUOUS_LIMIT_EXCEEDED

    fun buildPreview(pageContent: String): String? {
        val normalized = pageContent
            .replace(whitespaceRegex, " ")
            .trim()

        if (normalized.isEmpty()) {
            return null
        }

        return normalized.take(PREVIEW_LENGTH) +
            if (normalized.length > PREVIEW_LENGTH) "..." else ""
    }
}
