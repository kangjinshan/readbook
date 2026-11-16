package com.readbook.tv.ui.reader

import com.readbook.tv.data.api.WordAudioData
import java.security.MessageDigest

object ReaderAudioValidation {
    fun matches(word: String, data: WordAudioData, bytes: ByteArray): Boolean =
        data.word == word && data.mimeType == "audio/mpeg" && bytes.size in 12..1_000_000 &&
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) } == data.audioSha256
}
