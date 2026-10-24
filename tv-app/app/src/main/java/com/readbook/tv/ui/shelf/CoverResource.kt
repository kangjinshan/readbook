package com.readbook.tv.ui.shelf

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

internal data class CoverResource(val url: String, val authorized: Boolean)

/** Supports legacy absolute URLs and the storage-relative paths returned by sync. */
internal fun coverResource(baseUrl: String, coverPath: String?): CoverResource? {
    val base = baseUrl.toHttpUrlOrNull() ?: return null
    val value = coverPath?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val url = value.toHttpUrlOrNull() ?: run {
        val relative = value.removePrefix("./").removePrefix("/").removePrefix("storage/")
        if (!relative.startsWith("covers/")) return null
        val file = relative.removePrefix("covers/")
        if (file.isEmpty() || file.contains('/') || file.contains('\\') || file == "..") return null
        base.resolve("/storage/$relative") ?: return null
    }
    val sameOrigin = url.scheme == base.scheme && url.host == base.host && url.port == base.port
    return CoverResource(url.toString(), sameOrigin && url.encodedPath.startsWith("/storage/covers/"))
}
