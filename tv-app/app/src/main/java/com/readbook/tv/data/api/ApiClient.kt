package com.readbook.tv.data.api

import android.content.Context
import com.readbook.tv.BuildConfig
import okhttp3.Cache
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.math.pow

/**
 * API 客户端
 * Retrofit 配置和单例
 */
object ApiClient {

    @Volatile
    private var baseUrl: String = BuildConfig.DEFAULT_BASE_URL

    @Volatile
    private var cache: Cache? = null

    private var deviceToken: String? = null

    // 重试配置
    private const val MAX_RETRIES = 3
    private const val INITIAL_BACKOFF_MS = 1000L
    private const val MAX_BACKOFF_MS = 10000L

    fun initialize(context: Context) {
        if (cache == null) {
            cache = Cache(File(context.cacheDir, "http_cache"), 20L * 1024 * 1024)
        }
        rebuildRetrofit()
    }

    /**
     * 设置设备 Token
     */
    fun setDeviceToken(token: String) {
        deviceToken = token
    }

    /**
     * 获取设备 Token
     */
    fun getDeviceToken(): String? = deviceToken

    fun getBaseUrl(): String = baseUrl

    fun openAuthorizedResource(url: String): okhttp3.Response {
        val request = Request.Builder()
            .url(url)
            .apply {
                deviceToken?.takeIf { it.isNotBlank() }?.let { token ->
                    header("Authorization", "Bearer $token")
                }
            }
            .build()

        return resourceClient.newCall(request).execute()
    }

    @Volatile
    private var okHttpClient: OkHttpClient = createOkHttpClient()

    @Volatile
    private var resourceClient: OkHttpClient = createResourceClient()

    /**
     * OkHttp 客户端
     */
    private fun createOkHttpClient(): OkHttpClient {
        val authInterceptor = Interceptor { chain ->
            val request = deviceToken?.let { token ->
                chain.request().newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            } ?: chain.request()

            chain.proceed(request)
        }

        val retryInterceptor = Interceptor { chain ->
            var request = chain.request()
            var response: okhttp3.Response? = null
            var exception: IOException? = null

            for (attempt in 0 until MAX_RETRIES) {
                try {
                    response?.close()
                    response = chain.proceed(request)

                    if (response.isSuccessful || response.code < 500) {
                        return@Interceptor response
                    }

                    exception = IOException("Server error: ${response.code}")
                } catch (e: IOException) {
                    exception = e
                }

                if (attempt < MAX_RETRIES - 1) {
                    val backoffMs = min(
                        INITIAL_BACKOFF_MS * 2.0.pow(attempt).toLong(),
                        MAX_BACKOFF_MS
                    )
                    Thread.sleep(backoffMs)
                }
            }

            response ?: throw exception ?: IOException("Unknown error")
        }

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(retryInterceptor)
            .addInterceptor(loggingInterceptor)
            .cache(cache)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private fun createResourceClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .cache(cache)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    @Volatile
    private var retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    @Volatile
    var tvApi: TvApi = retrofit.create(TvApi::class.java)
        private set

    private fun rebuildRetrofit() {
        okHttpClient = createOkHttpClient()
        resourceClient = createResourceClient()
        retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        tvApi = retrofit.create(TvApi::class.java)
    }

    /**
     * 更新服务器地址
     */
    fun updateBaseUrl(url: String) {
        val normalized = if (url.endsWith("/")) url else "$url/"
        if (normalized == baseUrl) return
        baseUrl = normalized
        rebuildRetrofit()
    }
}
