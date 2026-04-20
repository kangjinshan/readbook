package com.readbook.tv.ui.bind

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.readbook.tv.databinding.FragmentBindBinding

/**
 * 绑定页面 Fragment
 * 用于显示绑定码界面
 */
class BindFragment : Fragment() {

    private var _binding: FragmentBindBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentBindBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 设置初始状态
        binding.bindCodeText.text = "----"
        binding.statusText.text = "正在获取绑定码..."
    }

    /**
     * 更新绑定码显示
     */
    fun updateBindCode(code: String?) {
        if (code != null && code.length == 6) {
            val formatted = "${code.substring(0, 3)} ${code.substring(3)}"
            binding.bindCodeText.text = formatted
        } else {
            binding.bindCodeText.text = code ?: "----"
        }
    }

    /**
     * 更新状态文本
     */
    fun updateStatus(status: String) {
        binding.statusText.text = status
    }

    /**
     * 显示绑定成功
     */
    fun showBoundSuccess(childName: String?) {
        binding.bindCodeText.text = "绑定成功!"
        binding.statusText.text = "欢迎 $childName"
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
