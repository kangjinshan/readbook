package com.readbook.tv

import android.app.Application
import android.util.Log
import androidx.room.Room
import com.readbook.tv.data.api.ApiClient
import com.readbook.tv.data.local.AppDatabase
import com.readbook.tv.data.local.MIGRATION_1_2
import com.readbook.tv.data.local.MIGRATION_2_3
import com.readbook.tv.data.repository.BookRepository
import com.readbook.tv.data.repository.SyncRepository
import com.readbook.tv.service.BeijingTimeProvider
import com.readbook.tv.service.DailyReadingResetApplier
import com.readbook.tv.service.LockStateStore
import com.readbook.tv.service.PreferenceBackedGateStatePreferences
import com.readbook.tv.service.ReadingControlCoordinator
import com.readbook.tv.service.ReadingGateState
import com.readbook.tv.service.ReadingStateRepair
import com.readbook.tv.util.PreferenceManager
import java.util.UUID

/**
 * 应用程序入口
 */
class ReadBookApp : Application() {

    companion object {
        const val TAG = "ReadBookApp"
        lateinit var instance: ReadBookApp
            private set
    }

    // 数据库
    lateinit var database: AppDatabase
        private set

    // 偏好设置
    lateinit var preferenceManager: PreferenceManager
        private set
    lateinit var beijingTimeProvider: BeijingTimeProvider
        private set
    lateinit var lockStateStore: LockStateStore
        private set
    lateinit var readingControlCoordinator: ReadingControlCoordinator
        private set
    lateinit var dailyReadingResetApplier: DailyReadingResetApplier
        private set

    // 仓库
    lateinit var bookRepository: BookRepository
        private set
    lateinit var syncRepository: SyncRepository
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        // 初始化偏好设置
        preferenceManager = PreferenceManager(this)
        beijingTimeProvider = BeijingTimeProvider()
        lockStateStore = LockStateStore(PreferenceBackedGateStatePreferences(preferenceManager))
        readingControlCoordinator = ReadingControlCoordinator(
            lockStateStore = lockStateStore,
            beijingTimeProvider = beijingTimeProvider,
            policyPreferences = preferenceManager
        )
        dailyReadingResetApplier = DailyReadingResetApplier(
            preferences = preferenceManager,
            beijingTimeProvider = beijingTimeProvider,
            readingControlCoordinator = readingControlCoordinator
        )
        ApiClient.initialize(this)

        // 初始化数据库
        database = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java,
            "readbook.db"
        )
            .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
            .build()

        // 初始化仓库
        bookRepository = BookRepository(
            database = database,
            bookDao = database.bookDao(),
            chapterDao = database.chapterDao(),
            progressDao = database.progressDao(),
            bookmarkDao = database.bookmarkDao(),
            api = ApiClient.tvApi
        )

        syncRepository = SyncRepository(
            api = ApiClient.tvApi,
            bookRepository = bookRepository,
            chapterDao = database.chapterDao(),
            progressDao = database.progressDao(),
            bookmarkDao = database.bookmarkDao(),
            onPolicySynced = preferenceManager::updatePolicy
        )

        // 初始化设备 Token
        initDeviceToken()
        refreshReadingStateForToday()
    }

    /**
     * 初始化设备 Token
     */
    private fun initDeviceToken() {
        var token = preferenceManager.deviceToken
        if (token.isNullOrEmpty()) {
            token = UUID.randomUUID().toString()
            preferenceManager.deviceToken = token
        }
        ApiClient.setDeviceToken(token)
    }

    /**
     * 检查是否已绑定
     */
    fun isBound(): Boolean = preferenceManager.isBound

    /**
     * 获取绑定的子账号名称
     */
    fun getBoundChildName(): String? = preferenceManager.boundChildName

    /**
     * 清除绑定（用于解绑）
     */
    fun clearBinding() {
        preferenceManager.clearBinding()
        ApiClient.setDeviceToken(preferenceManager.deviceToken ?: "")
    }

    fun refreshReadingStateForToday(): ReadingGateState =
        dailyReadingResetApplier.applyIfDayChanged()
            ?.also { state ->
                Log.i(
                    TAG,
                    "applyIfDayChanged cleared counters: todayDate=${preferenceManager.todayDate}, todaySeconds=${preferenceManager.todayReadingSeconds}, continuousSeconds=${preferenceManager.continuousReadingSeconds}, state=$state"
                )
            }
            ?: readingControlCoordinator.currentState().let { state ->
                Log.i(
                    TAG,
                    "refreshReadingStateForToday before repair: todayDate=${preferenceManager.todayDate}, todaySeconds=${preferenceManager.todayReadingSeconds}, continuousSeconds=${preferenceManager.continuousReadingSeconds}, dailyLimitMinutes=${preferenceManager.dailyLimitMinutes}, state=$state"
                )
                if (ReadingStateRepair.shouldClearStaleDailyLimit(
                        state = state,
                        todayReadingSeconds = preferenceManager.todayReadingSeconds,
                        dailyLimitMinutes = preferenceManager.dailyLimitMinutes
                    )
                ) {
                    Log.i(
                        TAG,
                        "clearing stale daily limit lock: todaySeconds=${preferenceManager.todayReadingSeconds}, dailyLimitMinutes=${preferenceManager.dailyLimitMinutes}"
                    )
                    readingControlCoordinator.handleDailyReadingReset().also { repairedState ->
                        Log.i(
                            TAG,
                            "state after stale daily limit repair: todayDate=${preferenceManager.todayDate}, todaySeconds=${preferenceManager.todayReadingSeconds}, state=$repairedState"
                        )
                    }
                } else {
                    state
                }
            }
}
