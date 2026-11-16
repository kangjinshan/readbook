package com.readbook.tv.ui.reader

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** Each pronunciation owns its player thread, focus listener and file, including slow teardown. */
class ReaderWordAudioPlayer(
    context: Context,
    private val releasePlayer: (MediaPlayer) -> Unit = { it.release() },
    private val onError: () -> Unit
) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val main = Handler(Looper.getMainLooper())
    private val generation = AtomicLong()
    private val active = AtomicReference<Pronunciation?>()
    private val closed = AtomicBoolean()

    fun play(file: File) {
        val epoch = generation.incrementAndGet()
        active.getAndSet(null)?.cancel()
        if (closed.get()) { file.delete(); return }
        val session = Pronunciation(file, epoch)
        active.set(session)
        session.start()
    }

    /** Never waits for MediaPlayer.release(), which can block for seconds on TV audio effects. */
    fun stop() {
        generation.incrementAndGet()
        active.getAndSet(null)?.cancel()
    }

    fun close() {
        closed.set(true)
        stop()
    }

    private inner class Pronunciation(private val file: File, private val epoch: Long) {
        private val thread = HandlerThread("ReaderPronunciation").apply { start() }
        private val handler = Handler(thread.looper)
        private val cancelled = AtomicBoolean()
        // The fields below are accessed only on this session's player thread.
        private var media: MediaPlayer? = null
        private var released = false
        private var hasFocus = false
        private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
            if (change < 0) cancel()
        }

        private fun isCurrent() = !cancelled.get() && !closed.get() && generation.get() == epoch

        @Suppress("DEPRECATION")
        fun start() {
            handler.post {
                if (!isCurrent()) { release(); return@post }
                try {
                    val player = MediaPlayer()
                    media = player
                    player.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    player.setDataSource(file.absolutePath)
                    player.setOnPreparedListener {
                        if (!isCurrent()) { release(); return@setOnPreparedListener }
                        try {
                            hasFocus = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC,
                                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
                            if (hasFocus && isCurrent()) player.start() else release()
                        } catch (_: Exception) { fail() }
                    }
                    player.setOnCompletionListener { release() }
                    player.setOnErrorListener { _, _, _ -> fail(); true }
                    player.prepareAsync()
                } catch (_: Exception) { fail() }
            }
        }

        fun cancel() {
            cancelled.set(true)
            handler.post { release() }
        }

        private fun fail() {
            if (isCurrent()) main.post { if (isCurrent()) onError() }
            release()
        }

        @Suppress("DEPRECATION")
        private fun release() {
            if (released) return
            released = true
            active.compareAndSet(this, null)
            val player = media
            media = null
            try {
                player?.setOnPreparedListener(null)
                player?.setOnCompletionListener(null)
                player?.setOnErrorListener(null)
                if (player != null) {
                    // Silence the old clip before a potentially slow native release.
                    runCatching { if (player.isPlaying) player.pause() }
                    releasePlayer(player)
                }
            } catch (_: Exception) {
                // A codec teardown failure must not kill the app or retain the file/thread.
            } finally {
                runCatching { if (hasFocus) audioManager.abandonAudioFocus(focusListener) }
                file.delete()
                thread.quitSafely()
            }
        }
    }
}
