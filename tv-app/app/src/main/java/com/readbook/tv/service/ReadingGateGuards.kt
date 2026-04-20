package com.readbook.tv.service

object ReadingGateGuards {
    fun canEnterReader(state: ReadingGateState): Boolean = state is ReadingGateState.Unlocked
}
