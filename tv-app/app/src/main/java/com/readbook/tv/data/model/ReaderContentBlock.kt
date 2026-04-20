package com.readbook.tv.data.model

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.readbook.tv.data.api.ChapterContentBlockData

data class ReaderContentBlock(
    val type: String,
    val text: String? = null,
    val assetUrl: String? = null,
    val alt: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val widthPercent: Float? = null,
)

object ReaderContentBlocksJson {
    private val gson = Gson()
    private val listType = object : TypeToken<List<ReaderContentBlock>>() {}.type

    fun fromApi(blocks: List<ChapterContentBlockData>?): List<ReaderContentBlock> =
        blocks.orEmpty().map { block ->
            ReaderContentBlock(
                type = block.type,
                text = block.text,
                assetUrl = block.assetUrl,
                alt = block.alt,
                width = block.width,
                height = block.height,
                widthPercent = block.widthPercent,
            )
        }

    fun encode(blocks: List<ReaderContentBlock>): String =
        gson.toJson(blocks, listType)

    fun decode(raw: String?): List<ReaderContentBlock> {
        if (raw.isNullOrBlank()) {
            return emptyList()
        }
        return runCatching {
            gson.fromJson<List<ReaderContentBlock>>(raw, listType)
        }.getOrDefault(emptyList())
    }
}

object ReaderRenderCssJson {
    private val gson = Gson()
    private val listType = object : TypeToken<List<String>>() {}.type

    fun encode(cssTexts: List<String>): String =
        gson.toJson(cssTexts, listType)

    fun decode(raw: String?): List<String> {
        if (raw.isNullOrBlank()) {
            return emptyList()
        }
        return runCatching {
            gson.fromJson<List<String>>(raw, listType)
        }.getOrDefault(emptyList())
    }
}
