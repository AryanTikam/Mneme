"""Unit tests for Gemma LLM Singleton Service."""

import threading
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.llm_service import GemmaLLMService, get_llm_service


def test_singleton_identity():
    """Verify that get_instance() always returns the exact same object reference."""
    inst1 = GemmaLLMService.get_instance()
    inst2 = GemmaLLMService.get_instance()
    inst3 = get_llm_service()

    assert inst1 is inst2, "GemmaLLMService must be a singleton"
    assert inst2 is inst3, "get_llm_service must return the singleton instance"


def test_singleton_thread_safety():
    """Verify singleton initialization across concurrent threads."""
    instances = []

    def fetch_instance():
        instances.append(GemmaLLMService.get_instance())

    threads = [threading.Thread(target=fetch_instance) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(instances) == 10
    first = instances[0]
    for inst in instances[1:]:
        assert inst is first, "Concurrent thread retrieved different instance"


def test_gemma_chat_formatting():
    """Verify proper formatting matching the Gemma chat template."""
    service = get_llm_service()
    prompt = service.format_gemma_prompt("Hello Gemma", system_prompt="Be helpful")

    assert "<start_of_turn>user" in prompt
    assert "Be helpful" in prompt
    assert "Hello Gemma" in prompt
    assert "<end_of_turn>" in prompt
    assert "<start_of_turn>model" in prompt


def test_generation_and_streaming():
    """Verify synchronous generation and token streaming."""
    service = get_llm_service()

    # Generate test
    output = service.generate("Define hippocampus in memory consolidation.")
    assert isinstance(output, str)
    assert len(output) > 0

    # Stream test
    tokens = list(service.generate_stream("What is spaced repetition?"))
    assert len(tokens) > 0
    full_text = "".join(tokens)
    assert len(full_text) > 0

