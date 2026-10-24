package com.readbook.tv.ui.shelf

import org.junit.Assert.*
import org.junit.Test

class CoverResourceTest {
    private val base = "https://reader.example/"

    @Test fun resolvesStorageRelativeCoverPaths() {
        listOf("covers/52.jpeg", "/covers/52.jpeg", "storage/covers/52.jpeg", "./storage/covers/52.jpeg")
            .forEach { path ->
                assertEquals(CoverResource("https://reader.example/storage/covers/52.jpeg", true), coverResource(base, path))
            }
    }

    @Test fun keepsSameOriginLegacyAbsoluteUrlsAuthorized() {
        assertTrue(coverResource(base, "https://reader.example/storage/covers/52.jpeg")!!.authorized)
    }

    @Test fun neverAuthorizesExternalOrDowngradedUrls() {
        listOf("https://cdn.example/storage/covers/52.jpeg", "http://reader.example/storage/covers/52.jpeg",
            "https://reader.example:8443/storage/covers/52.jpeg").forEach { url ->
            assertFalse(coverResource(base, url)!!.authorized)
        }
    }

    @Test fun neverAuthorizesOtherSameOriginEndpoints() {
        assertFalse(coverResource(base, "https://reader.example/api/profile")!!.authorized)
    }

    @Test fun rejectsEmptyPathsAndLocalFiles() {
        listOf(null, "", "/data/private.png", "file:///sdcard/cover.png", "//cdn.example/cover.png")
            .forEach { assertNull(coverResource(base, it)) }
    }

    @Test fun rejectsTraversalInsteadOfTurningItIntoAnAuthorizedRequest() {
        assertNull(coverResource(base, "covers/../private.png"))
        assertNull(coverResource(base, "covers/..\\private.png"))
    }
}
