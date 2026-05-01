package com.readbook.tv.util

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.readbook.tv.data.model.ControlPolicy
import com.readbook.tv.service.DailyReadingResetPreferences
import com.readbook.tv.service.ReadingPolicyPreferences
import com.readbook.tv.ui.reader.ReaderBrightness

/**
 * 偏好设置管理器
 * 使用 EncryptedSharedPreferences 安全存储敏感数据
 */
class PreferenceManager(context: Context) : ReadingPolicyPreferences, DailyReadingResetPreferences {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // ==================== 设备相关 ====================

    /**
     * 设备 Token
     */
    var deviceToken: String?
        get() = sharedPreferences.getString(KEY_DEVICE_TOKEN, null)
        set(value) = sharedPreferences.edit().putString(KEY_DEVICE_TOKEN, value).apply()

    /**
     * 是否已绑定
     */
    var isBound: Boolean
        get() = sharedPreferences.getBoolean(KEY_IS_BOUND, false)
        set(value) = sharedPreferences.edit().putBoolean(KEY_IS_BOUND, value).apply()

    /**
     * 绑定的子账号 ID
     */
    var boundChildId: Long
        get() = sharedPreferences.getLong(KEY_CHILD_ID, -1)
        set(value) = sharedPreferences.edit().putLong(KEY_CHILD_ID, value).apply()

    /**
     * 绑定的子账号名称
     */
    var boundChildName: String?
        get() = sharedPreferences.getString(KEY_CHILD_NAME, null)
        set(value) = sharedPreferences.edit().putString(KEY_CHILD_NAME, value).apply()

    // ==================== 阅读设置 ====================

    /**
     * 字号设置
     */
    var fontSize: FontSize
        get() = runCatching {
            FontSize.valueOf(
                sharedPreferences.getString(KEY_FONT_SIZE, FontSize.MEDIUM.name) ?: FontSize.MEDIUM.name
            )
        }.getOrDefault(FontSize.MEDIUM)
        set(value) = sharedPreferences.edit().putString(KEY_FONT_SIZE, value.name).apply()

    /**
     * 主题设置
     */
    var theme: Theme
        get() = runCatching {
            Theme.valueOf(
                sharedPreferences.getString(KEY_THEME, Theme.YELLOW.name) ?: Theme.YELLOW.name
            )
        }.getOrDefault(Theme.YELLOW)
        set(value) = sharedPreferences.edit().putString(KEY_THEME, value.name).apply()

    /**
     * 阅读页面背景亮度遮罩
     */
    var readerBrightness: ReaderBrightness
        get() = runCatching {
            ReaderBrightness.valueOf(
                sharedPreferences.getString(KEY_READER_BRIGHTNESS, ReaderBrightness.BRIGHT.name)
                    ?: ReaderBrightness.BRIGHT.name
            )
        }.getOrDefault(ReaderBrightness.BRIGHT)
        set(value) = sharedPreferences.edit().putString(KEY_READER_BRIGHTNESS, value.name).apply()

    // ==================== 防沉迷相关 ====================

    /**
     * 每日阅读时长限制（分钟）
     */
    override var dailyLimitMinutes: Int
        get() = sharedPreferences.getInt(KEY_DAILY_LIMIT, 120)
        set(value) = sharedPreferences.edit().putInt(KEY_DAILY_LIMIT, value).apply()

    /**
     * 连续阅读时长限制（分钟）
     */
    override var continuousLimitMinutes: Int
        get() = sharedPreferences.getInt(KEY_CONTINUOUS_LIMIT, 45)
        set(value) = sharedPreferences.edit().putInt(KEY_CONTINUOUS_LIMIT, value).apply()

    /**
     * 休息时长（分钟）
     */
    override var restMinutes: Int
        get() = sharedPreferences.getInt(KEY_REST_MINUTES, 15)
        set(value) = sharedPreferences.edit().putInt(KEY_REST_MINUTES, value).apply()

    /**
     * 今日累计阅读时长（秒）
     */
    override var todayReadingSeconds: Long
        get() = sharedPreferences.getLong(KEY_TODAY_READING, 0)
        set(value) = sharedPreferences.edit().putLong(KEY_TODAY_READING, value).apply()

    /**
     * 今日日期（用于重置每日统计）
     */
    override var todayDate: String?
        get() = sharedPreferences.getString(KEY_TODAY_DATE, null)
        set(value) = sharedPreferences.edit().putString(KEY_TODAY_DATE, value).apply()

    /**
     * 当前连续阅读时长（秒）
     */
    override var continuousReadingSeconds: Long
        get() = sharedPreferences.getLong(KEY_CONTINUOUS_READING, 0)
        set(value) = sharedPreferences.edit().putLong(KEY_CONTINUOUS_READING, value).apply()

    /**
     * 锁屏结束时间
     */
    var lockEndTime: Long
        get() = sharedPreferences.getLong(KEY_LOCK_END_TIME, 0)
        set(value) = sharedPreferences.edit().putLong(KEY_LOCK_END_TIME, value).apply()

    /**
     * 最近一次退出阅读计时的时间
     */
    override var lastReadingStoppedAtEpochMs: Long
        get() = sharedPreferences.getLong(KEY_LAST_READING_STOPPED_AT_EPOCH_MS, 0L)
        set(value) = sharedPreferences.edit().putLong(KEY_LAST_READING_STOPPED_AT_EPOCH_MS, value).apply()

    // ==================== 允许设置 ====================

    /**
     * 允许的字号列表
     */
    var allowedFontSizes: Set<String>
        get() = sharedPreferences.getStringSet(KEY_ALLOWED_FONT_SIZES, setOf("small", "medium", "large")) ?: setOf()
        set(value) = sharedPreferences.edit().putStringSet(KEY_ALLOWED_FONT_SIZES, value).apply()

    /**
     * 允许的主题列表
     */
    var allowedThemes: Set<String>
        get() = sharedPreferences.getStringSet(KEY_ALLOWED_THEMES, setOf("yellow", "white", "dark")) ?: setOf()
        set(value) = sharedPreferences.edit().putStringSet(KEY_ALLOWED_THEMES, value).apply()

    // ==================== 同步配置 ====================

    /**
     * 心跳间隔（毫秒）
     */
    var heartbeatIntervalMs: Long
        get() = sharedPreferences.getLong(KEY_HEARTBEAT_INTERVAL, 30_000L)
        set(value) = sharedPreferences.edit().putLong(KEY_HEARTBEAT_INTERVAL, value).apply()

    /**
     * 禁止阅读开始时间 (HH:MM)
     */
    override var forbiddenStartTime: String?
        get() = sharedPreferences.getString(KEY_FORBIDDEN_START_TIME, null)
        set(value) = sharedPreferences.edit().putString(KEY_FORBIDDEN_START_TIME, value).apply()

    /**
     * 禁止阅读结束时间 (HH:MM)
     */
    override var forbiddenEndTime: String?
        get() = sharedPreferences.getString(KEY_FORBIDDEN_END_TIME, null)
        set(value) = sharedPreferences.edit().putString(KEY_FORBIDDEN_END_TIME, value).apply()

    /**
     * Gate 状态类型
     */
    var gateStateType: String?
        get() = sharedPreferences.getString(KEY_GATE_STATE_TYPE, null)
        set(value) = sharedPreferences.edit().putString(KEY_GATE_STATE_TYPE, value).apply()

    /**
     * Gate 锁定原因
     */
    var gateReason: String?
        get() = sharedPreferences.getString(KEY_GATE_REASON, null)
        set(value) = sharedPreferences.edit().putString(KEY_GATE_REASON, value).apply()

    /**
     * Gate 提示文案
     */
    var gateMessage: String?
        get() = sharedPreferences.getString(KEY_GATE_MESSAGE, null)
        set(value) = sharedPreferences.edit().putString(KEY_GATE_MESSAGE, value).apply()

    /**
     * 临时锁结束时间
     */
    var gateUntilEpochMs: Long
        get() = sharedPreferences.getLong(KEY_GATE_UNTIL_EPOCH_MS, 0L)
        set(value) = sharedPreferences.edit().putLong(KEY_GATE_UNTIL_EPOCH_MS, value).apply()

    /**
     * 策略锁重新检查时间
     */
    var gateRecheckEpochMs: Long
        get() = sharedPreferences.getLong(KEY_GATE_RECHECK_EPOCH_MS, 0L)
        set(value) = sharedPreferences.edit().putLong(KEY_GATE_RECHECK_EPOCH_MS, value).apply()

    override var lastAppliedDailyReadingResetEpochMs: Long
        get() = sharedPreferences.getLong(KEY_LAST_DAILY_READING_RESET_EPOCH_MS, 0L)
        set(value) = sharedPreferences.edit().putLong(KEY_LAST_DAILY_READING_RESET_EPOCH_MS, value).apply()

    // ==================== 辅助方法 ====================

    /**
     * 清除所有数据
     */
    fun clear() {
        sharedPreferences.edit().clear().apply()
    }

    /**
     * 清除绑定信息
     */
    fun clearBinding() {
        sharedPreferences.edit()
            .remove(KEY_IS_BOUND)
            .remove(KEY_CHILD_ID)
            .remove(KEY_CHILD_NAME)
            .apply()
    }

    /**
     * 更新防沉迷策略
     */
    fun updatePolicy(policy: ControlPolicy) {
        sharedPreferences.edit()
            .putInt(KEY_DAILY_LIMIT, policy.dailyLimitMinutes)
            .putInt(KEY_CONTINUOUS_LIMIT, policy.continuousLimitMinutes)
            .putInt(KEY_REST_MINUTES, policy.restMinutes)
            .putString(KEY_FORBIDDEN_START_TIME, policy.forbiddenStartTime)
            .putString(KEY_FORBIDDEN_END_TIME, policy.forbiddenEndTime)
            .putStringSet(KEY_ALLOWED_FONT_SIZES, policy.allowedFontSizes.toSet())
            .putStringSet(KEY_ALLOWED_THEMES, policy.allowedThemes.toSet())
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "readbook_secure_prefs"

        // Keys
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_IS_BOUND = "is_bound"
        private const val KEY_CHILD_ID = "child_id"
        private const val KEY_CHILD_NAME = "child_name"
        private const val KEY_FONT_SIZE = "font_size"
        private const val KEY_THEME = "theme"
        private const val KEY_READER_BRIGHTNESS = "reader_brightness"
        private const val KEY_DAILY_LIMIT = "daily_limit"
        private const val KEY_CONTINUOUS_LIMIT = "continuous_limit"
        private const val KEY_REST_MINUTES = "rest_minutes"
        private const val KEY_TODAY_READING = "today_reading"
        private const val KEY_TODAY_DATE = "today_date"
        private const val KEY_CONTINUOUS_READING = "continuous_reading"
        private const val KEY_LOCK_END_TIME = "lock_end_time"
        private const val KEY_LAST_READING_STOPPED_AT_EPOCH_MS = "last_reading_stopped_at_epoch_ms"
        private const val KEY_ALLOWED_FONT_SIZES = "allowed_font_sizes"
        private const val KEY_ALLOWED_THEMES = "allowed_themes"
        private const val KEY_HEARTBEAT_INTERVAL = "heartbeat_interval"
        private const val KEY_FORBIDDEN_START_TIME = "forbidden_start_time"
        private const val KEY_FORBIDDEN_END_TIME = "forbidden_end_time"
        private const val KEY_GATE_STATE_TYPE = "gate_state_type"
        private const val KEY_GATE_REASON = "gate_reason"
        private const val KEY_GATE_MESSAGE = "gate_message"
        private const val KEY_GATE_UNTIL_EPOCH_MS = "gate_until_epoch_ms"
        private const val KEY_GATE_RECHECK_EPOCH_MS = "gate_recheck_epoch_ms"
        private const val KEY_LAST_DAILY_READING_RESET_EPOCH_MS = "last_daily_reading_reset_epoch_ms"
    }
}

/**
 * 字号枚举
 */
enum class FontSize(val dp: Int) {
    SMALL(28),
    MEDIUM(34),
    LARGE(40)
}

/**
 * 主题枚举
 */
enum class Theme(
    val backgroundColor: String,
    val textColor: String,
    val secondaryColor: String
) {
    YELLOW(
        backgroundColor = "#FFF8DC",
        textColor = "#2A2A2A",
        secondaryColor = "#888888"
    ),
    WHITE(
        backgroundColor = "#FAFAFA",
        textColor = "#1A1A1A",
        secondaryColor = "#777777"
    ),
    DARK(
        backgroundColor = "#222222",
        textColor = "#E0E0E0",
        secondaryColor = "#AAAAAA"
    )
}
