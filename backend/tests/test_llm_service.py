"""Unit tests for Groq LLM Singleton Service."""

import threading
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.llm_service import LLMService, get_llm_service


def test_singleton_identity():
    """Verify that get_instance() always returns the exact same object reference."""
    inst1 = LLMService.get_instance()
    inst2 = LLMService.get_instance()
    inst3 = get_llm_service()

    assert inst1 is inst2, "LLMService must be a singleton"
    assert inst2 is inst3, "get_llm_service must return the singleton instance"


def test_singleton_thread_safety():
    """Verify singleton initialization across concurrent threads."""
    instances = []

    def fetch_instance():
        instances.append(LLMService.get_instance())

    threads = [threading.Thread(target=fetch_instance) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(instances) == 10
    first = instances[0]
    for inst in instances[1:]:
        assert inst is first, "Concurrent thread retrieved different instance"


def test_groq_messages_building():
    """Verify proper message construction for LangChain Groq."""
    service = get_llm_service()
    messages = service._build_messages("Hello Qwen", system_prompt="Be helpful")

    assert len(messages) == 2
    assert messages[0].content == "Be helpful"
    assert messages[1].content == "Hello Qwen"


def test_generation_and_streaming():
    """Verify synchronous generation and token streaming."""
    service = get_llm_service()

    # Generate test
    output = service.generate("Define concurrency and synchronization in distributed systems.")
    assert isinstance(output, str)
    assert len(output) > 0

    # Stream test
    tokens = list(service.generate_stream("What is an active recall feedback loop?"))
    assert len(tokens) > 0
    full_text = "".join(tokens)
    assert len(full_text) > 0

