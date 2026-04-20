package com.readbook.tv.ui.lock

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.readbook.tv.ReadBookApp
import com.readbook.tv.data.repository.SyncRepository
import com.readbook.tv.databinding.ActivityLockBinding
import com.readbook.tv.service.DailyReadingResetApplier
import com.readbook.tv.service.ReadingControlCoordinator
import com.readbook.tv.service.ReadingGateState
import com.readbook.tv.util.PreferenceManager
import com.readbook.tv.ui.shelf.ShelfActivity
import com.readbook.tv.util.AppBrightnessController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LockActivity : AppCompatActivity() {

    companion object {
        private const val SYNC_POLL_INTERVAL_MS = 30_000L
        private const val TAG = "LockActivity"
    }

    private lateinit var binding: ActivityLockBinding
    private lateinit var coordinator: ReadingControlCoordinator
    private lateinit var syncRepository: SyncRepository
    private lateinit var preferenceManager: PreferenceManager
    private lateinit var dailyReadingResetApplier: DailyReadingResetApplier
    private var countdownJob: Job? = null
    private var syncPollJob: Job? = null
    private var hasNavigatedAway = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as ReadBookApp
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = app.preferenceManager,
            baseColorRes = com.readbook.tv.R.color.theme_dark_background
        )
        binding = ActivityLockBinding.inflate(layoutInflater)
        setContentView(binding.root)
        coordinator = app.readingControlCoordinator
        syncRepository = app.syncRepository
        preferenceManager = app.preferenceManager
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, preferenceManager)
        dailyReadingResetApplier = DailyReadingResetApplier(
            preferences = preferenceManager,
            beijingTimeProvider = app.beijingTimeProvider,
            readingControlCoordinator = coordinator
        )

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                coordinator.state.collect { state ->
                    render(state)
                    if (state is ReadingGateState.Unlocked) {
                        navigateToShelf()
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (syncPollJob?.isActive == true) return
        syncPollJob = lifecycleScope.launch {
            delay(500)
            syncOnce()
            while (isActive) {
                delay(SYNC_POLL_INTERVAL_MS)
                syncOnce()
            }
        }
    }

    override fun onStop() {
        syncPollJob?.cancel()
        syncPollJob = null
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        (application as ReadBookApp).refreshReadingStateForToday()
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = preferenceManager,
            baseColorRes = com.readbook.tv.R.color.theme_dark_background
        )
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, preferenceManager)
        coordinator.recheck()
        lifecycleScope.launch {
            syncOnce()
        }
    }

    override fun onDestroy() {
        countdownJob?.cancel()
        syncPollJob?.cancel()
        super.onDestroy()
    }

    private fun render(state: ReadingGateState) {
        Log.i(TAG, "render lock state=$state")
        countdownJob?.cancel()
        countdownJob = null

        when (state) {
            ReadingGateState.Unlocked -> {
                binding.messageText.text = "阅读限制已解除"
                binding.countdownText.text = ""
                binding.actionHintText.text = "正在返回书架..."
            }

            is ReadingGateState.TemporaryLock -> {
                binding.messageText.text = state.message
                binding.actionHintText.text = "倒计时结束后可返回书架重新进入阅读"
                startCountdown(state.untilEpochMillis)
            }

            is ReadingGateState.PolicyBlocked -> {
                binding.messageText.text = state.message
                val recheckAt = state.recheckAtEpochMillis
                binding.countdownText.text = recheckAt?.let {
                    LockDurationFormatter.format(remainingSeconds(it))
                } ?: "--:--:--"
                binding.actionHintText.text = if (state.recheckAtEpochMillis != null) {
                    "请等待限制解除后再试"
                } else {
                    "请等待家长同步新的阅读策略"
                }
                if (recheckAt != null) {
                    startCountdown(recheckAt)
                }
            }
        }
    }

    private fun startCountdown(untilEpochMillis: Long) {
        countdownJob = lifecycleScope.launch {
            while (isActive) {
                val remainingSeconds = remainingSeconds(untilEpochMillis)
                binding.countdownText.text = LockDurationFormatter.format(remainingSeconds)
                if (remainingSeconds <= 0) {
                    coordinator.recheck()
                    break
                }
                delay(1000)
            }
        }
    }

    private fun navigateToShelf() {
        if (hasNavigatedAway) return
        hasNavigatedAway = true
        startActivity(
            Intent(this, ShelfActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        )
        finish()
    }

    private fun remainingSeconds(untilEpochMillis: Long): Long =
        ((untilEpochMillis - System.currentTimeMillis()) / 1000).coerceAtLeast(0)

    private suspend fun syncOnce() {
        val result = withContext(Dispatchers.IO) { syncRepository.sync() }
        val data = result.getOrNull()
        if (data == null) {
            Log.w(TAG, "lock-screen sync failed", result.exceptionOrNull())
            return
        }
        Log.i(TAG, "lock-screen sync succeeded")
        data.policy?.let(preferenceManager::updatePolicy)
        dailyReadingResetApplier.applyIfNew(data.dailyReadingResetAtEpochMs)
        coordinator.handlePolicySynced()
    }
}
