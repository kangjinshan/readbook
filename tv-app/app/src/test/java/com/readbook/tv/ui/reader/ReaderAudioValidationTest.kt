package com.readbook.tv.ui.reader

import com.readbook.tv.data.api.WordAudioData
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Test

class ReaderAudioValidationTest {
    @Test fun requiresTheClickedWordAndAnIntactMp3Payload() {
        val bytes = "ID3-test-audio-payload".toByteArray()
        val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        val data = WordAudioData("highest", "", "audio/mpeg", sha)
        assertTrue(ReaderAudioValidation.matches("highest",data,bytes))
        assertFalse(ReaderAudioValidation.matches("high",data,bytes))
        assertFalse(ReaderAudioValidation.matches("highest",data,bytes + 1))
        assertFalse(ReaderAudioValidation.matches("highest",data.copy(mimeType="text/html"),bytes))
        assertFalse(ReaderAudioValidation.matches("highest",data,byteArrayOf()))
    }
}
