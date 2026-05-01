package com.readbook.tv.service

import android.app.Service
import android.content.Intent
import android.content.Context
import android.os.IBinder
import android.util.Log
import com.readbook.tv.data.api.ApiClient
import com.readbook.tv.data.api.HeartbeatRequest
import com.readbook.tv.data.api.SessionStartResponse
import com.readbook.tv.data.model.ControlPolicy
import com.readbook.tv.data.api.SessionStartRequest
import com.readbook.tv.data.api.SessionEndRequest
import com.readbook.tv.data.repository.BookRepository
import com.readbook.tv.data.repository.SyncRepository
import com.readbook.tv.util.PreferenceManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * 同步服务
 * 负责数据同步、阅读会话管理、心跳上报
 */
class SyncService : Service() {

    companion object {
        private const val TAG = "SyncService"
        const val ACTION_START_SYNC = "start_sync"
        const val ACTION_STOP_SYNC = "stop_sync"
        const val ACTION_START_SESSION = "start_session"
        const val ACTION_END_SESSION = "end_session"
        const val ACTION_UPDATE_PAGE = "update_page"
        const val ACTION_POLL_BIND = "poll_bind"
        const val ACTION_STOP_BIND_POLL = "stop_bind_poll"

        const val EXTRA_BOOK_ID = "book_id"
        const val EXTRA_START_PAGE = "start_page"
        const val EXTRA_CURRENT_PAGE = "current_page"

        private fun startServiceCompat(context: Context, intent: Intent) {
            context.startService(intent)
        }

        fun startSync(context: Context) {
            startServiceCompat(context, Intent(context, SyncService::class.java).apply {
                action = ACTION_START_SYNC
            })
        }

        fun startSession(context: Context, bookId: Long, startPage: Int) {
            startServiceCompat(context, Intent(context, SyncService::class.java).apply {
                action = ACTION_START_SESSION
                putExtra(EXTRA_BOOK_ID, bookId)
                putExtra(EXTRA_START_PAGE, startPage)
            })
        }

        fun endSession(context: Context) {
            startServiceCompat(context, Intent(context, SyncService::class.java).apply {
                action = ACTION_END_SESSION
            })
        }

        fun updateCurrentPage(context: Context, page: Int) {
            startServiceCompat(context, Intent(context, SyncService::class.java).apply {
                action = ACTION_UPDATE_PAGE
                putExtra(EXTRA_CURRENT_PAGE, page)
            })
        }

        fun pollBind(context: Context) {
            startServiceCompat(context, Intent(context, SyncService::class.java).apply {
                action = ACTION_POLL_BIND
            })
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private lateinit var preferenceManager: PreferenceManager
    private lateinit var syncRepository: SyncRepository
    private lateinit var bookRepository: BookRepository
    private lateinit var readingControlCoordinator: ReadingControlCoordinator

    // 同步间隔（默认值，可从配置覆盖）
    private val syncInterval = 60_000L // 60秒
    private val heartbeatInterval: Long
        get() = preferenceManager.heartbeatIntervalMs.takeIf { it > 0 } ?: 30_000L
    private val bindPollInterval = 3_000L // 3秒

    // 同步任务
    private var syncJob: Job? = null
    private var heartbeatJob: Job? = null
    private var bindPollJob: Job? = null

    // 当前阅读会话
    private var currentSessionId: String? = null
    private var currentBookId: Long = 0
    private var currentPage: Int = 1
    private var sessionStartTime: Long = 0
    private var lastHeartbeatDurationSeconds: Long = 0

    // 状态流
    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState

    private val _lockState = MutableStateFlow<LockState>(LockState.Unlocked)
    val lockState: StateFlow<LockState> = _lockState

    private val _remoteCommand = MutableStateFlow<String?>(null)
    val remoteCommand: StateFlow<String?> = _remoteCommand

    override fun onCreate() {
        super.onCreate()
        preferenceManager = PreferenceManager(applicationContext)
        val app = application as com.readbook.tv.ReadBookApp
        syncRepository = app.syncRepository
        bookRepository = app.bookRepository
        readingControlCoordinator = app.readingControlCoordinator
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SYNC -> startSync()
            ACTION_STOP_SYNC -> stopSync()
            ACTION_START_SESSION -> {
                val bookId = intent.getLongExtra(EXTRA_BOOK_ID, 0)
                val startPage = intent.getIntExtra(EXTRA_START_PAGE, 1)
                startReadingSession(bookId, startPage)
            }
            ACTION_END_SESSION -> endReadingSession()
            ACTION_UPDATE_PAGE -> {
                currentPage = intent.getIntExtra(EXTRA_CURRENT_PAGE, currentPage).coerceAtLeast(1)
            }
            ACTION_POLL_BIND -> startBindPoll()
            ACTION_STOP_BIND_POLL -> stopBindPoll()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    // ==================== 同步功能 ====================

    private fun startSync() {
        syncJob?.cancel()
        syncJob = serviceScope.launch {
            while (isActive) {
                try {
                    _syncState.value = SyncState.Syncing

                    val result = syncRepository.sync()
                    if (result.isSuccess) {
                        val data = result.getOrNull()
                        data?.policy?.let(preferenceManager::updatePolicy)
                        data?.dailyReadingResetAtEpochMs?.let { resetAt ->
                            AntiAddictionService.applyDailyReadingReset(this@SyncService, resetAt)
                        }
                        readingControlCoordinator.handlePolicySynced()
                        data?.remoteCommand?.let { command ->
                            _remoteCommand.value = command
                        }
                        _syncState.value = SyncState.Synced
                    } else {
                        _syncState.value = SyncState.Error(result.exceptionOrNull()?.message ?: "同步失败")
                    }
                } catch (e: Exception) {
                    _syncState.value = SyncState.Error(e.message ?: "同步异常")
                }

                delay(syncInterval)
            }
        }
    }

    private fun stopSync() {
        syncJob?.cancel()
        syncJob = null
        _syncState.value = SyncState.Idle
    }

    // ==================== 阅读会话 ====================

    private fun startReadingSession(bookId: Long, startPage: Int) {
        currentBookId = bookId
        currentPage = startPage
        sessionStartTime = System.currentTimeMillis()
        lastHeartbeatDurationSeconds = 0

        serviceScope.launch {
            try {
                val response = ApiClient.tvApi.startSession(
                    SessionStartRequest(bookId, startPage)
                )

                if (response.isSuccess() && response.data != null) {
                    val data = response.data

                    if (!data.allowed) {
                        val lockDurationMinutes = data.lockDurationMinutes ?: 0
                        if (data.reason == "continuous_limit_exceeded" && lockDurationMinutes > 0) {
                            readingControlCoordinator.handleHeartbeatResult(
                                shouldLock = true,
                                reason = data.reason,
                                message = data.message,
                                lockDurationMinutes = lockDurationMinutes
                            )
                        } else {
                            readingControlCoordinator.handleSessionStartDenied(
                                reason = data.reason,
                                message = data.message
                            )
                        }
                        _lockState.value = LockState.Locked(
                            reason = data.reason ?: "forbidden",
                            message = data.message ?: "当前不允许阅读",
                            durationMinutes = lockDurationMinutes
                        )
                        broadcastLockState(
                            data.reason ?: "forbidden",
                            data.message ?: "当前不允许阅读",
                            lockDurationMinutes * 60L
                        )
                        endReadingSession()
                        return@launch
                    }

                    data.policy?.let { policy ->
                        preferenceManager.updatePolicy(
                            ControlPolicy(
                                dailyLimitMinutes = policy.dailyLimitMinutes,
                                continuousLimitMinutes = policy.continuousLimitMinutes,
                                restMinutes = policy.restMinutes,
                                forbiddenStartTime = policy.forbiddenStartTime,
                                forbiddenEndTime = policy.forbiddenEndTime,
                                allowedFontSizes = policy.allowedFontSizes ?: preferenceManager.allowedFontSizes.toList(),
                                allowedThemes = policy.allowedThemes ?: preferenceManager.allowedThemes.toList()
                            )
                        )
                        Log.i(
                            TAG,
                            "session start synced policy: daily=${policy.dailyLimitMinutes}, continuous=${policy.continuousLimitMinutes}"
                        )
                    }
                    preferenceManager.todayReadingSeconds = data.todayReadMinutes * 60L
                    resolveServerContinuousSeconds(data)?.let { serverContinuousSeconds ->
                        preferenceManager.continuousReadingSeconds =
                            maxOf(preferenceManager.continuousReadingSeconds, serverContinuousSeconds)
                    }
                    currentSessionId = data.sessionId
                    startHeartbeat()
                }
            } catch (e: Exception) {
                Log.w(TAG, "会话启动失败，进入离线阅读模式: ${e.message}")
                _syncState.value = SyncState.Error("离线阅读模式")
            }
        }
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = serviceScope.launch {
            while (isActive && currentSessionId != null) {
                try {
                    val durationSeconds = (System.currentTimeMillis() - sessionStartTime) / 1000
                    val deltaSeconds = (durationSeconds - lastHeartbeatDurationSeconds).coerceAtLeast(0)

                    val response = ApiClient.tvApi.heartbeat(
                        HeartbeatRequest(
                            sessionId = currentSessionId!!,
                            currentPage = currentPage,
                            durationSeconds = deltaSeconds
                        )
                    )

                    if (response.isSuccess() && response.data != null) {
                        val data = response.data
                        lastHeartbeatDurationSeconds = durationSeconds

                        if (data.shouldLock) {
                            readingControlCoordinator.handleHeartbeatResult(
                                shouldLock = true,
                                reason = data.reason,
                                message = data.message,
                                lockDurationMinutes = data.lockDurationMinutes
                            )
                            _lockState.value = LockState.Locked(
                                reason = data.reason ?: "continuous_limit_exceeded",
                                message = data.message ?: "需要休息",
                                durationMinutes = data.lockDurationMinutes
                            )
                            broadcastLockState(
                                data.reason ?: "continuous_limit_exceeded",
                                data.message ?: "需要休息",
                                data.lockDurationMinutes * 60L
                            )
                            endReadingSession()
                            return@launch
                        }

                        data.remoteCommand?.let { command: String ->
                            _remoteCommand.value = command
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "心跳失败: ${e.message}")
                }

                delay(heartbeatInterval)
            }
        }
    }

    private fun endReadingSession() {
        val sessionId = currentSessionId
        val finalPage = currentPage
        val startedAt = sessionStartTime
        val lastHeartbeatSeconds = lastHeartbeatDurationSeconds

        serviceScope.launch {
            sessionId?.let { activeSessionId ->
                try {
                    val totalDurationSeconds = (System.currentTimeMillis() - startedAt) / 1000
                    val finalDeltaSeconds = (totalDurationSeconds - lastHeartbeatSeconds).coerceAtLeast(0)

                    if (finalDeltaSeconds > 0) {
                        ApiClient.tvApi.heartbeat(
                            HeartbeatRequest(
                                sessionId = activeSessionId,
                                currentPage = finalPage,
                                durationSeconds = finalDeltaSeconds
                            )
                        )
                    }

                    ApiClient.tvApi.endSession(
                        SessionEndRequest(
                            sessionId = activeSessionId,
                            endPage = finalPage
                        )
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "结束会话失败: ${e.message}")
                }
            }
        }

        heartbeatJob?.cancel()
        heartbeatJob = null
        currentSessionId = null
        currentBookId = 0
        currentPage = 1
        lastHeartbeatDurationSeconds = 0
    }

    private fun resolveServerContinuousSeconds(data: SessionStartResponse): Long? {
        data.continuousReadSeconds?.takeIf { it > 0L }?.let { return it }
        data.continuousReadMinutes?.takeIf { it > 0 }?.let { return it * 60L }
        return null
    }

    // ==================== 绑定轮询 ====================

    private fun startBindPoll() {
        bindPollJob?.cancel()
        bindPollJob = serviceScope.launch {
            while (isActive) {
                try {
                    val result = syncRepository.getBindStatus()
                    val status = result.getOrNull()
                    if (result.isSuccess && status?.bound == true) {
                        preferenceManager.isBound = true
                        status.child?.let { child ->
                            preferenceManager.boundChildId = child.id
                            preferenceManager.boundChildName = child.name
                        }
                        _syncState.value = SyncState.Bound
                        break
                    }
                } catch (_: Exception) {
                    // 继续轮询
                }

                delay(bindPollInterval)
            }
        }
    }

    private fun stopBindPoll() {
        bindPollJob?.cancel()
        bindPollJob = null
    }

    private fun broadcastLockState(reason: String, message: String, remainingSeconds: Long) {
        sendBroadcast(Intent(AntiAddictionService.ACTION_LOCK_STATE_CHANGED).apply {
            putExtra(AntiAddictionService.EXTRA_IS_LOCKED, true)
            putExtra(AntiAddictionService.EXTRA_REMAINING_SECONDS, remainingSeconds)
            putExtra(AntiAddictionService.EXTRA_REASON, reason)
            putExtra(AntiAddictionService.EXTRA_MESSAGE, message)
        })
    }
}

/**
 * 同步状态
 */
sealed class SyncState {
    object Idle : SyncState()
    object Syncing : SyncState()
    object Synced : SyncState()
    object Bound : SyncState()
    data class Error(val message: String) : SyncState()
}

/**
 * 锁屏状态
 */
sealed class LockState {
    object Unlocked : LockState()
    data class Locked(
        val reason: String,
        val message: String,
        val durationMinutes: Int
    ) : LockState()
}
