package com.readbook.tv.data.repository

import com.readbook.tv.data.api.BookData

internal fun findRemovedBookIds(localBookIds: List<Long>, serverBooks: List<BookData>): List<Long> {
    val serverBookIds = serverBooks.map { it.id }.toSet()
    return localBookIds.filterNot(serverBookIds::contains)
}
