package com.readbook.tv.ui.bind

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.readbook.tv.R
import com.readbook.tv.ReadBookApp
import com.readbook.tv.data.api.ApiClient
import com.readbook.tv.data.api.RegisterRequest
import com.readbook.tv.data.repository.SyncRepository
import com.readbook.tv.databinding.ActivityBindBinding
import com.readbook.tv.service.SyncService
import com.readbook.tv.ui.shelf.ShelfActivity
import com.readbook.tv.util.AppBrightnessController
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * 设备绑定页面
 * 显示绑定码并轮询绑定状态
 */
class BindActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBindBinding
    private lateinit var syncRepository: SyncRepository
    private lateinit var preferenceManager: com.readbook.tv.util.PreferenceManager

    private var pollJob: Job? = null
    private var countdownJob: Job? = null
    private var bindCode: String? = null
    private var expiresInSeconds: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as ReadBookApp
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = app.preferenceManager,
            baseColorRes = R.color.theme_yellow_background
        )
        binding = ActivityBindBinding.inflate(layoutInflater)
        setContentView(binding.root)
        syncRepository = app.syncRepository
        preferenceManager = app.preferenceManager
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, preferenceManager)

        // 首次注册设备
        registerDevice()
    }

    override fun onResume() {
        super.onResume()
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = preferenceManager,
            baseColorRes = R.color.theme_yellow_background
        )
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, preferenceManager)
    }

    override fun onDestroy() {
        super.onDestroy()
        pollJob?.cancel()
        countdownJob?.cancel()
    }

    /**
     * 注册设备并获取绑定码
     */
    private fun registerDevice() {
        lifecycleScope.launch {
            try {
                val deviceToken = preferenceManager.deviceToken ?: return@launch

                // 注册设备
                val registerResult = syncRepository.registerDevice(deviceToken)
                if (registerResult.isFailure) {
                    binding.bindCodeText.text = "注册失败，请检查网络"
                    return@launch
                }

                // 保存服务端返回的 deviceToken（可能是新生成的）
                registerResult.getOrNull()?.deviceToken?.let { newToken ->
                    if (newToken != deviceToken) {
                        preferenceManager.deviceToken = newToken
                        ApiClient.setDeviceToken(newToken)
                    }
                }

                // 获取绑定状态（包含绑定码）
                val statusResult = syncRepository.getBindStatus()
                if (statusResult.isSuccess) {
                    val status = statusResult.getOrNull()
                    if (status?.bound == true) {
                        // 已经绑定，直接进入书架
                        onBound(status.child?.name)
                    } else {
                        // 显示绑定码
                        bindCode = status?.bindCode
                        expiresInSeconds = status?.expiresIn ?: 600
                        showBindCode()
                        startPolling()
                    }
                } else {
                    binding.bindCodeText.text = "获取绑定码失败"
                }
            } catch (e: Exception) {
                binding.bindCodeText.text = "网络错误: ${e.message}"
            }
        }
    }

    /**
     * 显示绑定码
     */
    private fun showBindCode() {
        binding.bindCodeText.text = bindCode ?: "----"
        binding.statusText.text = "绑定码 ${expiresInSeconds / 60} 分钟内有效"

        // 格式化显示（每两位一组）
        val code = bindCode ?: ""
        if (code.length == 6) {
            val formatted = "${code.substring(0, 3)} ${code.substring(3)}"
            binding.bindCodeText.text = formatted
        }
    }

    /**
     * 开始轮询绑定状态
     */
    private fun startPolling() {
        pollJob?.cancel()
        countdownJob?.cancel()

        // 最大轮询时间限制（默认10分钟）
        val maxPollTimeMs = (expiresInSeconds * 1000L).coerceAtMost(10 * 60 * 1000L)
        val startTime = System.currentTimeMillis()

        // 每秒倒计时
        var remainingSeconds = expiresInSeconds
        countdownJob = lifecycleScope.launch {
            while (isActive && remainingSeconds > 0) {
                val min = remainingSeconds / 60
                val sec = remainingSeconds % 60
                binding.statusText.text = "等待绑定中... ($min:${String.format("%02d", sec)})"
                delay(1000)
                remainingSeconds--
            }

            // 倒计时结束，显示超时提示
            if (remainingSeconds <= 0) {
                binding.bindCodeText.text = "绑定码已过期"
                binding.statusText.text = "请重启应用重新获取绑定码"
            }
        }

        // 每 3 秒轮询绑定状态
        pollJob = lifecycleScope.launch {
            while (isActive) {
                // 检查是否超时
                if (System.currentTimeMillis() - startTime > maxPollTimeMs) {
                    break
                }

                delay(3000)

                val statusResult = syncRepository.getBindStatus()
                if (statusResult.isSuccess) {
                    val status = statusResult.getOrNull()
                    if (status?.bound == true) {
                        onBound(status.child?.name)
                        return@launch
                    }

                    // 绑定码过期，重新获取
                    if (status?.bindCode != bindCode) {
                        bindCode = status?.bindCode
                        expiresInSeconds = status?.expiresIn ?: 600
                        remainingSeconds = expiresInSeconds
                        showBindCode()
                    }
                }
            }
        }
    }

    /**
     * 绑定成功
     */
    private fun onBound(childName: String?) {
        pollJob?.cancel()

        // 保存绑定信息
        preferenceManager.isBound = true
        if (!childName.isNullOrBlank()) {
            preferenceManager.boundChildName = childName
        }

        // 显示成功提示
        binding.bindCodeText.text = "绑定成功!"
        binding.statusText.text = "欢迎 $childName"

        // 延迟跳转到书架
        lifecycleScope.launch {
            delay(1500)
            startActivity(android.content.Intent(this@BindActivity, ShelfActivity::class.java))
            finish()
        }
    }
}
