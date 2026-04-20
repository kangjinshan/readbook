package com.readbook.tv.ui.shelf

import com.readbook.tv.data.model.Book
import com.readbook.tv.data.model.ReadingProgress

/**
 * 书架展示模型
 */
data class ShelfBookItem(
    val book: Book,
    val progress: ReadingProgress?
) {
    val currentPage: Int
        get() = progress?.currentPage?.coerceIn(1, book.totalPages) ?: 1

    val progressPercent: Int
        get() {
            if (book.totalPages <= 0) return 0
            val rawPercent = ((currentPage * 100f) / book.totalPages).toInt().coerceIn(0, 100)
            return if (hasProgress && rawPercent == 0) 1 else rawPercent
        }

    val hasProgress: Boolean
        get() = progress != null && progress.currentPage > 1
}
