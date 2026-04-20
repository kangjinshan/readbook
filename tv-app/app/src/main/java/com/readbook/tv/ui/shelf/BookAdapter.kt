package com.readbook.tv.ui.shelf

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.readbook.tv.R
import com.readbook.tv.data.model.Book
import com.readbook.tv.databinding.ItemBookBinding

/**
 * 书籍列表适配器
 */
class BookAdapter(
    private val listener: OnBookClickListener
) : ListAdapter<ShelfBookItem, BookAdapter.BookViewHolder>(BookDiffCallback()) {

    interface OnBookClickListener {
        fun onBookClick(book: Book)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): BookViewHolder {
        val binding = ItemBookBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return BookViewHolder(binding)
    }

    override fun onBindViewHolder(holder: BookViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class BookViewHolder(
        private val binding: ItemBookBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        init {
            binding.root.setOnFocusChangeListener { _, hasFocus ->
                updateFocusState(hasFocus)
            }

            binding.root.setOnClickListener {
                val position = adapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    listener.onBookClick(getItem(position).book)
                }
            }
        }

        fun bind(item: ShelfBookItem) {
            val book = item.book
            binding.titleText.text = book.title
            binding.authorText.text = book.author ?: "未知作者"
            binding.pageInfoText.text = itemView.context.getString(R.string.shelf_total_pages, book.totalPages)
            binding.progressText.text = if (item.hasProgress) {
                itemView.context.getString(R.string.shelf_current_page, item.currentPage)
            } else {
                itemView.context.getString(R.string.shelf_not_started)
            }
            binding.progressPercentText.text = itemView.context.getString(
                R.string.shelf_progress_percent,
                item.progressPercent
            )
            binding.progressBar.max = 100
            binding.progressBar.progress = item.progressPercent

            book.coverUrl?.let { url ->
                Glide.with(binding.coverImage)
                    .load(url)
                    .placeholder(R.drawable.book_cover_placeholder)
                    .error(R.drawable.book_cover_placeholder)
                    .fitCenter()
                    .into(binding.coverImage)
            } ?: run {
                binding.coverImage.setImageResource(R.drawable.book_cover_placeholder)
            }

            updateFocusState(binding.root.isFocused)
        }

        private fun updateFocusState(hasFocus: Boolean) {
            if (hasFocus) {
                binding.root.scaleX = 1.04f
                binding.root.scaleY = 1.04f
                binding.root.alpha = 1.0f
                binding.root.setBackgroundResource(R.drawable.book_card_focused)
                binding.coverFrame.alpha = 1.0f
            } else {
                binding.root.scaleX = 1.0f
                binding.root.scaleY = 1.0f
                binding.root.alpha = 0.96f
                binding.root.setBackgroundResource(R.drawable.book_card_normal)
                binding.coverFrame.alpha = 0.96f
            }
        }
    }

    class BookDiffCallback : DiffUtil.ItemCallback<ShelfBookItem>() {
        override fun areItemsTheSame(oldItem: ShelfBookItem, newItem: ShelfBookItem): Boolean {
            return oldItem.book.id == newItem.book.id
        }

        override fun areContentsTheSame(oldItem: ShelfBookItem, newItem: ShelfBookItem): Boolean {
            return oldItem == newItem
        }
    }
}
