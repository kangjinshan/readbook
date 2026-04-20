package com.readbook.tv.service

import android.content.Intent
import android.app.Service
import android.content.Context
import android.os.IBinder
import com.readbook.tv.util.PreferenceManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * 防沉迷服务
 * 本地计时和锁屏控制
 */
class AntiAddictionService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private lateinit var preferenceManager: PreferenceManager
    private lateinit var readingControlCoordinator: ReadingControlCoordinator
    private lateinit var beijingTimeProvider: BeijingTimeProvider
    private lateinit var dailyReadingResetApplier: DailyReadingResetApplier

    // 计时器
    private var timerJob: Job? = null
    private var lockTimerJob: Job? = null
    private var pendingPersistSeconds = 0L

    // 状态流
    private val _continuousSeconds = MutableStateFlow(0L)
    val continuousSeconds: StateFlow<Long> = _continuousSeconds

    private val _todaySeconds = MutableStateFlow(0L)
    val todaySeconds: StateFlow<Long> = _todaySeconds

    private val _remainingContinuousMinutes = MutableStateFlow(0)
    val remainingContinuousMinutes: StateFlow<Int> = _remainingContinuousMinutes

    private val _remainingDailyMinutes = MutableStateFlow(0)
    val remainingDailyMinutes: StateFlow<Int> = _remainingDailyMinutes

    private val _isLocked = MutableStateFlow(false)
    val isLocked: StateFlow<Boolean> = _isLocked

    private val _lockEndTime = MutableStateFlow(0L)
    val lockEndTime: StateFlow<Long> = _lockEndTime

    private val _lockRemainingSeconds = MutableStateFlow(0L)
    val lockRemainingSeconds: StateFlow<Long> = _lockRemainingSeconds

    override fun onCreate() {
        super.onCreate()
        val app = application as com.readbook.tv.ReadBookApp
        preferenceManager = app.preferenceManager
        readingControlCoordinator = app.readingControlCoordinator
        beijingTimeProvider = app.beijingTimeProvider
        dailyReadingResetApplier = DailyReadingResetApplier(
            preferences = preferenceManager,
            beijingTimeProvider = beijingTimeProvider,
            readingControlCoordinator = readingControlCoordinator
        )
        restoreOrResetDailyCounters()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_TIMER -> startTimer()
            ACTION_STOP_TIMER -> stopTimer()
            ACTION_LOCK -> {
                val durationMinutes = intent.getIntExtra(EXTRA_LOCK_DURATION, 15)
                lock(durationMinutes)
            }
            ACTION_UNLOCK -> unlock()
            ACTION_CHECK_LOCK -> checkLockStatus()
            ACTION_APPLY_DAILY_READING_RESET -> {
                val resetAtEpochMillis = intent.getLongExtra(EXTRA_DAILY_READING_RESET_AT_EPOCH_MS, 0L)
                applyServerDailyReset(resetAtEpochMillis)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        persistReadingCounters(force = true)
        super.onDestroy()
        serviceScope.cancel()
    }

    // ==================== 计时功能 ====================

    private fun startTimer() {
        if (timerJob?.isActive == true) return

        resetDailyIfNeeded()

        if (applyGateStateIfLocked(readingControlCoordinator.currentState())) {
            return
        }

        // 检查是否在禁止时段
        val policy = getPolicy()
        if (policy.isForbiddenTime()) {
            reportPolicyBlocked(
                reason = "forbidden_time",
                message = "当前为禁止阅读时段"
            )
            return
        }

        timerJob = serviceScope.launch {
            while (isActive) {
                // 每秒更新
                delay(1000)
                resetDailyIfNeeded()

                val currentPolicy = getPolicy()
                if (currentPolicy.isForbiddenTime()) {
                    reportPolicyBlocked(
                        reason = "forbidden_time",
                        message = "当前为禁止阅读时段"
                    )
                    break
                }

                _continuousSeconds.value += 1
                _todaySeconds.value += 1
                pendingPersistSeconds += 1
                persistReadingCounters()

                // 计算剩余时间
                updateRemainingTime()

                // 检查限制
                checkLimits()
            }
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
        persistReadingCounters(force = true)

        // 重置连续阅读计时
        _continuousSeconds.value = 0
        preferenceManager.continuousReadingSeconds = 0
    }

    private fun updateRemainingTime() {
        val dailyLimitSeconds = preferenceManager.dailyLimitMinutes * 60L
        val continuousLimitSeconds = preferenceManager.continuousLimitMinutes * 60L

        _remainingDailyMinutes.value = ((dailyLimitSeconds - _todaySeconds.value) / 60).toInt().coerceAtLeast(0)
        _remainingContinuousMinutes.value = ((continuousLimitSeconds - _continuousSeconds.value) / 60).toInt().coerceAtLeast(0)
    }

    private fun checkLimits() {
        // 检查每日限制
        val dailyLimitSeconds = preferenceManager.dailyLimitMinutes * 60L
        if (_todaySeconds.value >= dailyLimitSeconds) {
            reportPolicyBlocked(
                reason = "daily_limit_exceeded",
                message = "今日阅读时长已达上限"
            )
            return
        }

        // 检查连续阅读限制
        val continuousLimitSeconds = preferenceManager.continuousLimitMinutes * 60L
        if (_continuousSeconds.value >= continuousLimitSeconds) {
            readingControlCoordinator.handleHeartbeatResult(
                shouldLock = true,
                reason = "continuous_limit_exceeded",
                message = "连续阅读已达上限，请休息一下",
                lockDurationMinutes = preferenceManager.restMinutes
            )
            lock(preferenceManager.restMinutes)
        }
    }

    // ==================== 锁屏功能 ====================

    private fun lock(
        durationMinutes: Int,
        reason: String = "continuous_limit_exceeded",
        message: String = "请休息一下"
    ) {
        timerJob?.cancel()
        timerJob = null
        persistReadingCounters(force = true)
        _isLocked.value = true
        notifyLockStateChanged(true, durationMinutes * 60L, reason, message)

        val endTime = System.currentTimeMillis() + durationMinutes * 60 * 1000L
        _lockEndTime.value = endTime
        preferenceManager.lockEndTime = endTime

        startLockCountdown(endTime)
    }

    private fun unlock() {
        _lockEndTime.value = 0
        _lockRemainingSeconds.value = 0
        preferenceManager.lockEndTime = 0

        lockTimerJob?.cancel()
        lockTimerJob = null

        // 重置连续阅读计时
        _continuousSeconds.value = 0
        preferenceManager.continuousReadingSeconds = 0

        val nextState = readingControlCoordinator.recheck()
        if (applyGateStateIfLocked(nextState)) {
            return
        }

        _isLocked.value = false
        notifyLockStateChanged(false, 0, "unlock", "已解除锁定")
    }

    private fun checkLockStatus() {
        if (!applyGateStateIfLocked(readingControlCoordinator.currentState())) {
            _isLocked.value = false
            _lockEndTime.value = 0L
            _lockRemainingSeconds.value = 0L
            preferenceManager.lockEndTime = 0L
        }
    }

    private fun applyServerDailyReset(resetAtEpochMillis: Long) {
        val state = dailyReadingResetApplier.applyIfNew(resetAtEpochMillis) ?: return

        pendingPersistSeconds = 0
        _todaySeconds.value = preferenceManager.todayReadingSeconds
        _continuousSeconds.value = preferenceManager.continuousReadingSeconds
        updateRemainingTime()

        if (state is ReadingGateState.Unlocked) {
            lockTimerJob?.cancel()
            lockTimerJob = null
            _lockEndTime.value = 0L
            _lockRemainingSeconds.value = 0L
            preferenceManager.lockEndTime = 0L
            if (_isLocked.value) {
                _isLocked.value = false
                notifyLockStateChanged(false, 0L, "daily_reset", "已清零今日阅读时长")
            }
            return
        }

        applyGateStateIfLocked(state)
    }

    private fun persistReadingCounters(force: Boolean = false) {
        if (!force && pendingPersistSeconds < 30) return
        preferenceManager.todayReadingSeconds = _todaySeconds.value
        preferenceManager.continuousReadingSeconds = _continuousSeconds.value
        pendingPersistSeconds = 0
    }

    private fun reportPolicyBlocked(reason: String, message: String) {
        timerJob?.cancel()
        timerJob = null
        lockTimerJob?.cancel()
        lockTimerJob = null
        persistReadingCounters(force = true)
        _isLocked.value = true
        _lockEndTime.value = 0L
        _lockRemainingSeconds.value = 0L
        preferenceManager.lockEndTime = 0L
        readingControlCoordinator.handleSessionStartDenied(reason, message)
        notifyLockStateChanged(true, 0L, reason, message)
    }

    private fun applyGateStateIfLocked(state: ReadingGateState): Boolean =
        when (state) {
            ReadingGateState.Unlocked -> false
            is ReadingGateState.TemporaryLock -> {
                timerJob?.cancel()
                timerJob = null
                _isLocked.value = true
                _lockEndTime.value = state.untilEpochMillis
                preferenceManager.lockEndTime = state.untilEpochMillis
                val remainingSeconds = ((state.untilEpochMillis - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
                _lockRemainingSeconds.value = remainingSeconds
                notifyLockStateChanged(
                    true,
                    remainingSeconds,
                    state.reason.toWireReason(),
                    state.message
                )
                startLockCountdown(state.untilEpochMillis)
                true
            }

            is ReadingGateState.PolicyBlocked -> {
                timerJob?.cancel()
                timerJob = null
                lockTimerJob?.cancel()
                lockTimerJob = null
                _isLocked.value = true
                _lockEndTime.value = 0L
                _lockRemainingSeconds.value = 0L
                preferenceManager.lockEndTime = 0L
                notifyLockStateChanged(
                    true,
                    0L,
                    state.reason.toWireReason(),
                    state.message
                )
                true
            }
        }

    private fun startLockCountdown(endTime: Long) {
        lockTimerJob?.cancel()
        lockTimerJob = serviceScope.launch {
            while (isActive) {
                val remaining = (endTime - System.currentTimeMillis()) / 1000
                _lockRemainingSeconds.value = remaining.coerceAtLeast(0)

                if (remaining <= 0) {
                    unlock()
                    break
                }

                delay(1000)
            }
        }
    }

    private fun notifyLockStateChanged(locked: Boolean, remainingSeconds: Long, reason: String, message: String) {
        sendBroadcast(Intent(ACTION_LOCK_STATE_CHANGED).apply {
            putExtra(EXTRA_IS_LOCKED, locked)
            putExtra(EXTRA_REMAINING_SECONDS, remainingSeconds)
            putExtra(EXTRA_REASON, reason)
            putExtra(EXTRA_MESSAGE, message)
        })
    }

    // ==================== 辅助方法 ====================

    private fun restoreOrResetDailyCounters() {
        val today = beijingTimeProvider.currentBeijingDate().toString()
        val savedDate = preferenceManager.todayDate

        if (savedDate != today) {
            // 新的一天，重置计数
            preferenceManager.todayDate = today
            preferenceManager.todayReadingSeconds = 0
            preferenceManager.continuousReadingSeconds = 0
            _todaySeconds.value = 0
            _continuousSeconds.value = 0
        } else {
            // 恢复今日累计
            _todaySeconds.value = preferenceManager.todayReadingSeconds
            _continuousSeconds.value = preferenceManager.continuousReadingSeconds
        }
    }

    private fun resetDailyIfNeeded() {
        val today = beijingTimeProvider.currentBeijingDate().toString()
        if (preferenceManager.todayDate == today) {
            return
        }

        preferenceManager.todayDate = today
        preferenceManager.todayReadingSeconds = 0
        preferenceManager.continuousReadingSeconds = 0
        _todaySeconds.value = 0
        _continuousSeconds.value = 0
        pendingPersistSeconds = 0
        updateRemainingTime()
    }

    private fun getPolicy(): com.readbook.tv.data.model.ControlPolicy {
        // 从配置读取禁止时段，如果没有配置则使用默认值
        val forbiddenStart = preferenceManager.forbiddenStartTime ?: "22:00"
        val forbiddenEnd = preferenceManager.forbiddenEndTime ?: "07:00"

        return com.readbook.tv.data.model.ControlPolicy(
            dailyLimitMinutes = preferenceManager.dailyLimitMinutes,
            continuousLimitMinutes = preferenceManager.continuousLimitMinutes,
            restMinutes = preferenceManager.restMinutes,
            forbiddenStartTime = forbiddenStart,
            forbiddenEndTime = forbiddenEnd,
            allowedFontSizes = preferenceManager.allowedFontSizes.toList(),
            allowedThemes = preferenceManager.allowedThemes.toList()
        )
    }

    companion object {
        const val ACTION_START_TIMER = "start_timer"
        const val ACTION_STOP_TIMER = "stop_timer"
        const val ACTION_LOCK = "lock"
        const val ACTION_UNLOCK = "unlock"
        const val ACTION_CHECK_LOCK = "check_lock"
        const val ACTION_APPLY_DAILY_READING_RESET = "apply_daily_reading_reset"
        const val ACTION_LOCK_STATE_CHANGED = "com.readbook.tv.ACTION_LOCK_STATE_CHANGED"

        const val EXTRA_LOCK_DURATION = "lock_duration"
        const val EXTRA_IS_LOCKED = "is_locked"
        const val EXTRA_REMAINING_SECONDS = "remaining_seconds"
        const val EXTRA_REASON = "reason"
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_DAILY_READING_RESET_AT_EPOCH_MS = "daily_reading_reset_at_epoch_ms"

        private fun startServiceCompat(context: Context, intent: Intent) {
            context.startService(intent)
        }

        fun startTimer(context: Context) {
            startServiceCompat(context, Intent(context, AntiAddictionService::class.java).apply {
                action = ACTION_START_TIMER
            })
        }

        fun stopTimer(context: Context) {
            startServiceCompat(context, Intent(context, AntiAddictionService::class.java).apply {
                action = ACTION_STOP_TIMER
            })
        }

        fun lock(context: Context, durationMinutes: Int = 15) {
            startServiceCompat(context, Intent(context, AntiAddictionService::class.java).apply {
                action = ACTION_LOCK
                putExtra(EXTRA_LOCK_DURATION, durationMinutes)
            })
        }

        fun unlock(context: Context) {
            startServiceCompat(context, Intent(context, AntiAddictionService::class.java).apply {
                action = ACTION_UNLOCK
            })
        }

        fun checkLock(context: Context) {
            startServiceCompat(context, Intent(context, AntiAddictionService::class.java).apply {
                action = ACTION_CHECK_LOCK
            })
        }

        fun applyDailyReadingReset(context: Context, resetAtEpochMillis: Long) {
            startServiceCompat(context, Intent(context, AntiAddictionService::class.java).apply {
                action = ACTION_APPLY_DAILY_READING_RESET
                putExtra(EXTRA_DAILY_READING_RESET_AT_EPOCH_MS, resetAtEpochMillis)
            })
        }
    }
}

private fun LockReason.toWireReason(): String = when (this) {
    LockReason.FORBIDDEN_TIME -> "forbidden_time"
    LockReason.DAILY_LIMIT_EXCEEDED -> "daily_limit_exceeded"
    LockReason.CONTINUOUS_LIMIT_EXCEEDED -> "continuous_limit_exceeded"
    LockReason.NO_POLICY -> "no_policy"
    LockReason.SERVER_DENIED -> "server_denied"
}
