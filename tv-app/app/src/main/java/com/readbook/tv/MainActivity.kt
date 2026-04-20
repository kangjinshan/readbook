package com.readbook.tv

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.readbook.tv.databinding.ActivityMainBinding
import com.readbook.tv.service.ReadingGateGuards
import com.readbook.tv.ui.bind.BindActivity
import com.readbook.tv.ui.lock.LockActivity
import com.readbook.tv.ui.shelf.ShelfActivity
import com.readbook.tv.util.AppBrightnessController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 主 Activity - 启动页
 * 负责判断绑定状态并跳转到对应页面
 */
class MainActivity : AppCompatActivity() {

    private companion object {
        const val TAG = "MainActivity"
    }

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as ReadBookApp
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = app.preferenceManager,
            baseColorRes = R.color.theme_yellow_background
        )
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, app.preferenceManager)

        // 显示启动画面
        lifecycleScope.launch {
            // 短暂延迟显示启动画面
            delay(1000)

            // 检查绑定状态
            val refreshedState = app.refreshReadingStateForToday()
            val nextActivity = when {
                !app.isBound() -> BindActivity::class.java
                ReadingGateGuards.canEnterReader(app.readingControlCoordinator.currentState()) -> ShelfActivity::class.java
                else -> LockActivity::class.java
            }
            Log.i(
                TAG,
                "launch routing: isBound=${app.isBound()}, refreshedState=$refreshedState, currentState=${app.readingControlCoordinator.currentState()}, next=${nextActivity.simpleName}"
            )

            startActivity(Intent(this@MainActivity, nextActivity))
            finish()
        }
    }

    override fun onResume() {
        super.onResume()
        val app = application as ReadBookApp
        AppBrightnessController.applyWindowBackground(
            activity = this,
            preferenceManager = app.preferenceManager,
            baseColorRes = R.color.theme_yellow_background
        )
        AppBrightnessController.applyOverlay(binding.brightnessOverlay, app.preferenceManager)
    }
}
